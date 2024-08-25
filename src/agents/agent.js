import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";

import { queryExecuter } from "../clientDB/connectClientDb.js"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js"
import {DatabaseCredentials} from "../models/dbCreds.js"
import { generateAgentPrompt,generateJsonPrompt,queryExecuter_prompt } from './prompt.js'
import { modelNames } from "mongoose";
import { response } from "express";

async function callAgent(input, chat_history=[], schema, dbDetail, llm,session_doc) {
    try {
        const model = new ChatOpenAI(llm.config);
        const prompts = generateAgentPrompt()
        const prompt = ChatPromptTemplate.fromMessages([
            ("system", prompts),
            new MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const customTool = new DynamicTool({
            name: "sql_query_executor",
            description: "Execute SQL queries and return results",
            func: async (input) => {
                return await getData(input,session_doc,dbDetail)
            }
        });

        const tools = [customTool];

        const agent = await createOpenAIFunctionsAgent({
            llm: model,
            prompt,
            tools,
            input: function (i) {
                const parsedInput = JSON.parse(i.input); // Assuming the input is in JSON format

                return {
                    input: parsedInput.SQL_query || i.input, // Pass SQL query or other input
                    dbtype: config.dbtype // Include the database type from configuration
                };
            },
        });

        // Create the executor
        const agentExecutor = new AgentExecutor({
            agent,
            tools,
        });

        let response = await agentExecutor.invoke({
            input: input,
            chat_history: chat_history,
            schema: schema,
            dbtype: dbDetail.dbtype
        });

        
        const sqlKeywords = ["SELECT", "JOIN", "WHERE", "GROUP BY", "ORDER BY", "LIMIT"];

        // Create a regular expression pattern to detect SQL queries
        const sqlPattern = new RegExp(`\\b(${sqlKeywords.join('|')})\\b`, 'i');

        // Check if the input string contains any SQL keywords
        const query_check = sqlPattern.test(response.output);

        if(query_check){
            const data = await extractQuery(session_doc,response.output,model)
            await getData(data.sql_query,session_doc,dbDetail)
            session_doc.agent_history = `${data.response}, Query generated: ${session_doc.SQL_query?session_doc.SQL_query:""}`
            session_doc.agent = data.response
        }else{
            session_doc.agent_history = `${response.output}, Query generated: ${session_doc.SQL_query?session_doc.SQL_query:""}`
            session_doc.agent = response.output
        }

        if(session_doc.DB_response && session_doc.SQL_query){
            const data = await generateJson(input, session_doc.SQL_query,model)
            session_doc.query_description = data.query_description?data.query_description:null
            session_doc.followup = data.followup?data.followup:null
        }
        return session_doc;


    } catch (error) {
        console.error(error)
    }
}

async function getData(input,session_doc,dbDetail) {
    {
        const maxRetries = 1; // Number of retry attempts
        let attempt = 0;
    
        // Function to execute the SQL query with retries
        const executeQuery = async (query) => {
            try {
                console.log("Input to the tool: ", query);
    
                // Execute the SQL query
                const sql_result = await queryExecuter(dbDetail, query);
    
                session_doc.SQL_query = query;
                session_doc.DB_response = sql_result;
                console.log("Response from SQL query: ", sql_result);
    
                // Process the response
                if (sql_result && sql_result.length > 0) {
                    return `Query executed successfully.`;
                } else {
                    return "No results found for the query.";
                }
            } catch (error) {
                console.error("Error in custom tool function: ", error);
    
                // Check if the error is a timeout error or other network-related errors
                if (error.message.includes("ETIMEDOUT") || error.message.includes("ECONNREFUSED")) {
                    throw error; // Re-throw the error to handle it in the retry logic
                } else {
                    // If another error occurs, return the error message immediately
                    return `There was an error processing your request: ${error.message}`;
                }
            }
        };
    
        while (attempt < maxRetries) {
            try {
                const query = input.trim(); // Ensure input is the SQL query
                return await executeQuery(query);
            } catch (error) {
                attempt++;
                console.log(`Retrying query... Attempt ${attempt} of ${maxRetries}`);
    
                // If maximum retries reached, return a timeout error message
                if (attempt >= maxRetries) {
                    return "There was an error processing your request due to a timeout. Please try again later.";
                }
            }
        }
    }
}



async function generateJson(data, query, model) {
    const prompt = await generateJsonPrompt(data,query)
    const response = await model.invoke(prompt);
    const jsonData = response.content.replace(/```json\n|```/g, '').trim() // Remove any extra whitespace
    // console.log("generate json data ",jsonData)
    return JSON.parse(jsonData); // Return the query directly as a string

}

async function extractQuery(session_doc,input, model) {
    const prompt = await queryExecuter_prompt(input)
    const response = await model.invoke(prompt);
    console.log(response)
    const jsonData = response.content.replace(/```json\n|```/g, '').trim() // Remove any extra whitespace
    console.log("generate json data ",jsonData)
    return JSON.parse(jsonData); // Return the query directly as a string

}

async function chatHistory(chat_history) {
    try {
        const new_chatHistory = [];
        for(let i=0;i<chat_history.length;i++){
            new_chatHistory.push(new HumanMessage({
                content:chat_history[i]['message'][0]['human']
            }))
            new_chatHistory.push(new AIMessage({
                content:chat_history[i]['message'][0]['agent']
            }))
        }
        return new_chatHistory
    } catch (error) {
        
    }
}



async function askQuestion(session_doc) {
    try {
        let {input, chat_history, dbDetail, llm_model} = session_doc
        if(!dbDetail.schema ){
            try {
                dbDetail.schema = await fetchSchemaFromDb(dbDetail);
        
                // Update the user's database credentials with the new schema
                const data = await DatabaseCredentials.updateOne(
                    { userId: session_doc.userId },
                    { $set: { schema: dbDetail.schema } }
                );
                console.log(data)
            } catch (error) {
                console.error("Error fetching schema or updating the database:", error);
                // Handle error appropriately, maybe return or throw
            }
        }
        chat_history = await chatHistory(chat_history) 
        session_doc = await callAgent(input, chat_history, JSON.stringify(dbDetail.schema), dbDetail, llm_model,session_doc)
        console.log(session_doc)
       
        session_doc.chat_history = {
            human:input,
            agent:session_doc?.agent_history??""
        }
       return session_doc
    } catch (err) {
        console.error(err)
    }
}

export {
    askQuestion
}



