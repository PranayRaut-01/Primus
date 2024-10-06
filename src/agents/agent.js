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

        // input = await queryRefine(input,model,JSON.parse(schema))

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
            session_doc.agent = session_doc.summary?session_doc.summary:data.response
        }else{
            session_doc.agent_history = `${session_doc.summary?session_doc.summary:response.output}`
            session_doc.agent = session_doc.summary?session_doc.summary:response.output
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
                            return generateInsightsFromChunk(chunk, model, session_doc.input);
                        });
                        
                        // Wait for all chunk promises to resolve
                        const chunkInsights = await Promise.all(chunkPromises);

                        // Push the insights from resolved promises into the insights array
                        insights.push(...chunkInsights);
                        console.log('All chunks processed successfully');

                        // Combine all insights into a final summary
                        const finalSummary = insights.join(' \n ');
                        const finalData = await generateInsightsFromBulk(finalSummary,model,session_doc.input)
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
async function generateInsightsFromChunk(chunk, model, query) {
    try {
        // Create a prompt message array for the model
        const prompt = `Summarize the following data and summary should be in brief and must contains some numbers or values in numaric form also not include more than 50 to 100 keywords:
        Warning : do not mention any currency relate info in response like rs or doller symbol.
        Here the user input ${query}
        \n${JSON.stringify(chunk)}
        
        `;
        
        const response = await model.invoke(prompt);
        
        return response.content || "No insights generated";
    } catch (error) {
        console.error("Error generating insights: ", error);
        return "Error generating insights";
    }
}


async function generateInsightsFromBulk(chunk, model, query) {
    try {
        // Create a prompt message array for the model
        const prompt = `
        You are a seasoned data analyst with extensive experience in transforming raw datasets into valuable insights. Your task is to analyze the provided dataset comprehensively and generate actionable insights that can drive strategic decisions.

         Warning : do not mention any currency relate info in response like rs or doller symbol.

        Here are the details of the dataset:  
        - Data Metrics:   
        - Analysis Period:   
        - Categories to Compare:   

        In your analysis, focus on the following areas:  
        - Trend Identification: Identify and quantify key trends, noting percentage changes in metrics over time.  (not mandatory)
        - Comparative Analysis: Compare performance across specified categories and highlight which segments are excelling or underperforming.  (not mandatory)
        - Performance Metrics: Extract key performance indicators, providing numerical insights and noting significant deviations.  (not mandatory)
        - Suggestions and Recommendations: Offer practical recommendations with data-backed reasoning for improving performance.  
        - Anomalies and Opportunities: Identify unexpected data points and suggest corrective actions or improvement opportunities.  

        Warning : do not mention any currency relate info in response like rs or doller symbol.

        Ensure your insights are clear, concise, and presented in a structured format that facilitates understanding. Include relevant numbers, comparisons, and percentage changes with rational explanations to support your findings. 
        User Requiremnt : ${query}
        Data :${JSON.stringify(chunk)}


`;
        
        const response = await model.invoke(prompt);
        
        return response.content || "No insights generated";
    } catch (error) {
        console.error("Error generating insights: ", error);
        return "Error generating insights";
    }
}

async function queryRefine( query, model,schema) {
    const columnNames = schema.map(item => item.column_name);

    const prompt = `
        "Given a user input, rephrase it into a more compatible query structure, below you have given an column array relate the user keywords with column name and refine the query. Ensure the following:
        Note: please return same query it is not related to columns or if its related to general queryies like greeting , graditues etc.
        Extraction and Grouping: Identify the main entity (e.g., agent, order, users, phone numbers, dates,amount, period etc) and ensure the query includes extraction of all relevant details. If applicable, group the data by the primary entity (e.g., geopued by picked entity).
        Joins: If the query involves multiple entities (e.g., users, orders, date, duration etc), join the relevant tables.
        Aggregation: If the query involves multiple records per entity (e.g., multiple documents, multiple orders), include aggregation functions (e.g., SUM, COUNT, AVG) to calculate values across groups.
        Conditions: Apply any time constraints or filters (e.g., last month, date range, time range etc.
        Output: Ensure the query returns the necessary details for each group.
        Examples:

        User input: "I want all the details of the agent."
        Rewritten input: "Extract all details related to the agent, grouped by agent, and calculate aggregate values (if multiple records exist)."
        User input: "Provide all the details of orders by users last month."
        Rewritten input: "Fetch all order details from last month, join with the user table, and group orders by user. Calculate aggregate fields after grouping."
        columns: ${JSON.stringify(columnNames)}
        userinput input: ${query}
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



