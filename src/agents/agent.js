import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";

import { queryExecuter } from "../clientDB/connectClientDb.js"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js"
import { initializeModel } from '../llm_model/llm.js'
import { generateFollowupPrompt } from './prompt.js'

async function callAgent(input, chat_history=[], schema, dbDetail, llm) {
    try {

        const result = {}
        // const model = await initializeModel(llm)
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
                    result.SQL_query = input
                    result.DB_response = sql_result
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

        response = await generateJson(response.output, result.SQL_query ? result.SQL_query : "",model)
        result.agent = response
        return result;


    } catch (error) {
        console.error(error)
    }
}

async function generateJson(data, query, model) {
    const prompt = `
  Given the following string input, please convert it into JSON format with the keys as described below:
  
  Input String:${data}
  sql Query :${query}
  
  **JSON Format:**
  
  json
  {
    "response": "[summary of response based on the input string]",
    "followup": ["option 1", "option 2", "option 3" (detect follow-up questions from the string) if any else []],
    "insight": "[if the string contains data that resembles a database output, provide relevant insights here]" else null,
    "query_description": "[describe the given SQL query if applicable]"
  }
  
  
  **Instructions:**
  
  1. Analyze the string for its content and summarize the main response.
  2. Identify any follow-up questions within the string and list them under the "followup" key, ensuring to return an empty array if no follow-ups are found.
  3. Look for any patterns or data that suggest it originates from a database, and provide insights if applicable; otherwise, set this to null.
  4. If the input string includes an SQL query, provide a description of it under the "query_description" key.
  
    `
    const response = await model.invoke(prompt);
    const jsonData = response.content.replace(/```json\n|```/g, '').trim() // Remove any extra whitespace
    console.log("generate json data ",jsonData)
    return JSON.parse(jsonData); // Return the query directly as a string

}



async function askQuestion(input, chat_history = [], dbDetail, llm) {
    try {
        // chat_history = await parseChatHistory(chat_history)
        // console.log(chat_history)
        const schema = await fetchSchemaFromDb(dbDetail)
        const response = await callAgent(input, chat_history, JSON.stringify(schema), dbDetail, llm)
        
        return {
            agent: response,
            // chat_history: chathistory
        }
    } catch (err) {
        console.error(err)
    }
}

export {
    askQuestion
}



