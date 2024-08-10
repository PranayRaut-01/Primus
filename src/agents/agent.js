

import { ChatOpenAI } from "@langchain/openai";
import readline from "readline";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

import { ChatPromptTemplate, MessagesPlaceholder, } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";

import { queryExecuter } from "../clientDB/connectClientDb"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo"
import { initializeModel } from '../llm_model/llm'
import {generateFollowupPrompt} from './prompt'
const config = {
    dbtype: 'PostgreSQL' // Example database type
  };

let sql_result; // store globally to push it into response--

// async function generateQuery(data, dbtype) {
//     const prompt = `
//   You are an SQL expert Just identify the given query.
//   INSTRUCTION 
//   if any error in correct the query correct it and return updated query. 
//   else return same query.

//   NOTE : you are restricted to return only query.
//   QUERY : ${data}
//   `
//     const response = await model.invoke(prompt);
//     console.log(response)
//     const query = response.content.trim(); // Remove any extra whitespace

//     console.log("Generated query:", query);

//     return query; // Return the query directly as a string

// }


const customTool = new DynamicTool({
    name: "sql_query_executor",
    description: "Execute SQL queries and return results",
    func: async (input,dbtype="pgsql") => {
        try {
            console.log("Input to the tool: ", input);

            // Ensure the input is directly the SQL query or passed appropriately
            const query = input.trim(); // Since input should already be the generated query
            sql_result = await queryExecuter(dbtype,query); // Assuming this is the function to execute the query


            console.log("Response from SQL query: ", sql_result);

            // Process the response based on the type of query
            if (sql_result && sql_result.length > 0) {
                return `Query executed successfully. Here are the results: ${JSON.stringify(sql_result)}`;
            } else {
                return "No results found for the query.";
            }
        } catch (error) {
            console.error("Error in custom tool function: ", error);
            return "There was an error processing your request.";
        }
    }
});



async function callAgent(input, chat_history, schema, dbtype,llm='openai') {
    try {
        const model = await initializeModel(llm)
        const prompts = generateFollowupPrompt()
        const prompt = ChatPromptTemplate.fromMessages([
            ("system", prompts),
            new MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const tools = [customTool];

        const agent = await createOpenAIFunctionsAgent({
            llm: model,
            prompt,
            tools,
            input: function(i) {
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

        const response = await agentExecutor.invoke({
            input: input,
            chat_history: chat_history,
            schema: schema,
            dbtype: dbtype
        }); 

        return response;


    } catch (error) {
        console.error(error)
    }
}

async function askQuestion(input, chat_history = [], schema, dbtype,llm) {
    try {
        if (!schema) {
            schema = fetchSchemaFromDb(dbtype)
        }
        let response = await callAgent(input,chat_history, schema, dbtype,llm)
        response.tool = sql_result ? sql_result : null
        const data = response.output.replace(/```json\n|```/g, '').trim();
        console.log("Agent: ", data);

        chat_history.push(new HumanMessage(input));
        chat_history.push(new AIMessage(data));
    } catch (err) {
        console.error(err)
    }
}

export {
    askQuestion
}



