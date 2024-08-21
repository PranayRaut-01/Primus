import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";

import { queryExecuter } from "../clientDB/connectClientDb.js"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js"
import {DatabaseCredentials} from "../models/dbCreds.js"
import { generateFollowupPrompt,generateJsonPrompt } from './prompt.js'

async function callAgent(input, chat_history=[], schema, dbDetail, llm,session_doc) {
    try {
        const model = new ChatOpenAI(llm.config);
        const prompts = generateFollowupPrompt()
        const prompt = ChatPromptTemplate.fromMessages([
            ("system", prompts),
            new MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const customTool = new DynamicTool({
            name: "sql_query_executor",
            description: "Execute SQL queries and return results",
            func: async (input, dbtype = "pgsql") => {
                try {
                    console.log("Input to the tool: ", input);

                    // Ensure the input is directly the SQL query or passed appropriately
                    const query = input.trim(); // Since input should already be the generated query
                    const sql_result = await queryExecuter(dbDetail, query); // Assuming this is the function to execute the query
                    session_doc.SQL_query = input
                    session_doc.DB_response = sql_result
                    console.log("Response from SQL query: ", sql_result);

                    // Process the response based on the type of query
                    if (sql_result && sql_result.length > 0) {
                        return `Query executed successfully. Here are the generated sql query: ${query}`;
                    } else {
                        return "No results found for the query.";
                    }
                } catch (error) {
                    console.error("Error in custom tool function: ", error);
                    return "There was an error processing your request.";
                }
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

        response = await generateJson(response.output, session_doc.SQL_query ? session_doc.SQL_query : "",model)
        session_doc.agent = response
        return session_doc;


    } catch (error) {
        console.error(error)
    }
}

async function generateJson(data, query, model) {
    const prompt = await generateJsonPrompt(data,query)
    const response = await model.invoke(prompt);
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
        session_doc.chat_history = {
            human:input,
            agent:session_doc?.agent?.response
        }
       return session_doc
    } catch (err) {
        console.error(err)
    }
}

export {
    askQuestion
}



