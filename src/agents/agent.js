import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";

import { queryExecuter } from "../clientDB/connectClientDb.js"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js"
import {DatabaseCredentials} from "../models/dbCreds.js"
import { errorResolution_prompt } from "../agents/prompt.js";
import { retrieveRelevantSchema } from "../clientDB/pinecone.js"
import { generateAgentPrompt,generateJsonPrompt,queryExecuter_prompt } from './prompt.js'

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
                return await getData(input,session_doc,dbDetail,model)
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

        input = await queryRefine(input,model)

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
            await getData(data.sql_query,session_doc,dbDetail,model)
            session_doc.agent_history =`${session_doc.summary?session_doc.summary:data.response}`
            session_doc.agent = data.response
        }else{
            session_doc.agent_history = `${session_doc.summary?session_doc.summary:response.output}`
            session_doc.agent = response.output
        }

        if(session_doc.DB_response && session_doc.SQL_query){
            const data = await generateJson(input, session_doc.summary?session_doc.summary:response.output,model)
            session_doc.query_description = data.query_description?data.query_description:null
            session_doc.followup = data.followup?data.followup:null
        }
        return session_doc;


    } catch (error) {
        console.error(error)
    }
}

async function getData(input, session_doc, dbDetail, model) {
    {
        const maxRetries = 2; 
        let attempt = 0;
        const chunkSize = 20; // Define chunk size to break large responses
        const executeQuery = async (query) => {
            try {
                if (attempt > maxRetries) {
                    const message = "There was an error processing your request due to a timeout. Please try again later.";
                    session_doc.error = message;
                    return;
                }
                
                console.log("Input to the tool: ", query);
                const sql_result = await queryExecuter(dbDetail, query);

                if (sql_result && sql_result.length > 0) {
                    session_doc.SQL_query = query;
                    session_doc.DB_response = sql_result;
                    console.log("Response from SQL query: ", sql_result);

                    
                        // If the result is large, break it into chunks and summarize
                        const chunks = chunkData(sql_result, chunkSize);
                        let insights = [];

                        // Iterate over each chunk and generate insights
                        const chunkPromises = chunks.map((chunk, index) => {
                            console.log(`Processing chunk ${index + 1}/${chunks.length}`);
                            return generateInsightsFromChunk(chunk, model);
                        });
                        
                        Promise.all(chunkPromises)
                          .then(chunkInsights => {
                            insights.push(...chunkInsights);
                            console.log('All chunks processed successfully');
                            // Continue further processing if needed
                          })
                          .catch(error => {
                            console.error('Error processing chunks:', error);
                            // Handle the error as needed
                          });

                        // Combine all insights into a final summary
                        const finalSummary = insights.join(' , ');
                        const finalData = await generateInsightsFromBulk(finalSummary,model)
                        // console.log("Summary of insights: ", finalSummary);
                        session_doc.summary = finalData;
                        return `Data generated successfully `;
                    }
                    //  else {
                    //     // If the result is small, return the data directly
                    //     return `Data generated: ${sql_result}`;
                    // }
                // }
                 else {
                    if (sql_result.message.includes("ETIMEDOUT")) {
                        attempt++;
                        return await executeQuery(newQuery);
                    } else {
                        const newQuery = await error_handler(query, dbDetail, sql_result, model);
                        attempt++;
                        return await executeQuery(newQuery);
                    }
                }
            } catch (error) {
                console.error("Error in custom tool function: ", error);
            }
        };

        const query = input.trim(); // Ensure input is the SQL query
        return await executeQuery(query);
    }
}

// Helper function to break data into chunks
function chunkData(data, chunkSize) {
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
}

// Function to generate insights from a chunk using the LLM
async function generateInsightsFromChunk(chunk, model) {
    try {
        // Create a prompt message array for the model
        const prompt = `Summarize the following data and summary should be in brief and must contains some numbers or values in numaric form also not include more than 50 to 100 keywords:\n${JSON.stringify(chunk)}`;
        
        const response = await model.invoke(prompt);
        
        return response.content || "No insights generated";
    } catch (error) {
        console.error("Error generating insights: ", error);
        return "Error generating insights";
    }
}


async function generateInsightsFromBulk(chunk, model) {
    try {
        // Create a prompt message array for the model
        const prompt = `
        You are provided with a raw dataset containing various metrics. 
        Your task is to perform a comprehensive analysis and generate actionable insights based on the data. 
        The insights must be supported by clear numbers, comparisons, and trends over time or between different categories. 
        Additionally, make recommendations based on these insights to help drive strategic decision-making.

        Your analysis should include the following:
        1. Trend Identification: Identify key trends in the data. For example, look for increases or decreases in sales, customer growth, website traffic, or other relevant metrics over a specific period. Quantify these changes using percentage growth or decline.
        2. Comparative Analysis: Compare different segments of data, such as regions, departments, products, or customer demographics. Highlight which groups are performing better or worse.
        3. Performance Metrics: Identify key performance indicators (KPIs) and provide numerical insights such as average values, max/min, or total sums. Use percentages to showcase significant deviations or improvements.
        4. Suggestions and Recommendations: Based on the analysis, suggest practical recommendations or strategies to improve performance. Support these suggestions with data-backed reasoning.
        5. Anomalies and Opportunities: Identify any anomalies or unexpected data points, such as sudden spikes or dips. Explain potential causes and suggest corrective actions or opportunities for improvement.

        Make sure to include all the relevant numbers, comparisons, and percentage changes, along with explanations of their significance. Summarize your findings with a clear action plan, highlighting potential areas for optimization or risk mitigation.



        Data :${JSON.stringify(chunk)}

`;
        
        const response = await model.invoke(prompt);
        
        return response.content || "No insights generated";
    } catch (error) {
        console.error("Error generating insights: ", error);
        return "Error generating insights";
    }
}

async function queryRefine( query, model) {
    const prompt = `
        "Given a user query, rephrase it into a more SQL-compatible query structure. Ensure the following:

Extraction and Grouping: Identify the main entity (e.g., agent, order) and ensure the query includes extraction of all relevant details. If applicable, group the data by the primary entity (e.g., group by agent, group by user).
Joins: If the query involves multiple entities (e.g., users and orders), join the relevant tables.
Aggregation: If the query involves multiple records per entity (e.g., multiple documents, multiple orders), include aggregation functions (e.g., SUM, COUNT, AVG) to calculate values across groups.
Conditions: Apply any time constraints or filters (e.g., last month, active users).
Output: Ensure the query returns the necessary details for each group.
Examples:

User Query: "I want all the details of the agent."
Rewritten SQL Query: "Extract all details related to the agent, grouped by agent, and calculate aggregate values (if multiple records exist)."
User Query: "Provide all the details of orders by users last month."
Rewritten SQL Query: "Fetch all order details from last month, join with the user table, and group orders by user. Calculate aggregate fields after grouping."

        userinput Query: ${query}
    `
    const response = await model.invoke(prompt);
    return response.content.replace("Rewritten SQL Query:","") || query // Remove any extra whitespace

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

async function error_handler(query,dbDetail,error,model) {
    try {
    const prompt = await errorResolution_prompt(query,dbDetail,error)
    const response = await model.invoke(prompt);
    return response.content
    } catch (err) {
        console.error(err)
    }
}

async function chatHistory(chat_history) {
    try {
        const new_chatHistory = [];
        const length = chat_history.length;

        if (length > 0) {
            const startIndex = Math.max(0, length - 4); // Start from the last 4 or less
            for (let i = length - 1; i >= startIndex; i--) {
                const lastSession = chat_history[i]['message'][0];
                new_chatHistory.push(new HumanMessage({
                    content: lastSession['human']
                }));
                new_chatHistory.push(new AIMessage({
                    content: lastSession['agent']
                }));
            }
        }
        return new_chatHistory;
    } catch (error) {
        console.error('getting error form chathistory formate',error)
    }
}



async function askQuestion(session_doc) {
    try {
        let {input, chat_history, dbDetail, llm_model} = session_doc
        if(dbDetail.isPincone && dbDetail.indexName){
            try {
                dbDetail.schema = await retrieveRelevantSchema(input, dbDetail.indexName);
            } catch (error) {
                console.error("Error fetching schema or updating the database:", error);
            }
        }
        chat_history = await chatHistory(chat_history) 
        session_doc = await callAgent(input, chat_history, JSON.stringify(dbDetail.schema), dbDetail, llm_model,session_doc)
        // console.log(session_doc)
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



