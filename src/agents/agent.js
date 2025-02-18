import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import axios from "axios";
import { queryExecuter } from "../clientDB/connectClientDb.js"
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js"
import {DatabaseCredentials} from "../models/dbCreds.js"
import { errorResolution_prompt } from "../agents/prompt.js";
import { retrieveRelevantSchema } from "../clientDB/pinecone.js"
import { generateAgentPrompt,generateJsonPrompt,queryExecuter_prompt } from './prompt.js'
import { createConnectionString } from "../controller/createdb.js";
import { asyncRunQuery } from '../agents/newAgent.js'
import { main } from "./chunkProcessor.js";
import { Parser } from 'json2csv';
import * as dotenv from "dotenv";
dotenv.config();

async function sqlQueryGenerator(input,session_doc,dbDetail) {
    try {
        const connectionString = createConnectionString(dbDetail);
        const requestData = {
            connection_string: connectionString,
            query: input,
            openai_api_key: process.env.OPENAI_API_KEY,
        };
        
        const response = await asyncRunQuery(requestData)
        console.log("Response:", response.data);
        session_doc.SQL_query = response.data.SQL_query
        return response.data.SQL_query;
    }    
    catch (error) {
        console.error(error)
    }
}

async function convertJsonToCsv(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Invalid JSON schema data");
    }
    try {
        const parser = new Parser();
        const csv = parser.parse(data);
        return csv;
    } catch (error) {
        console.error("Error converting JSON to CSV:", error.message);
        return null;
    }
}

async function callAgent(input, chat_history=[], schema, dbDetail, llm,session_doc) {
    try {
        const model = new ChatOpenAI(llm.config);
        let schema = ''
        if(!session_doc.dbschema){
            const data =  await fetchSchemaFromDb(dbDetail)
            schema = await convertJsonToCsv(data)
            session_doc.dbschema = schema
            session_doc.save()
        }else{
            schema = session_doc.schema
        }
        const prompts = generateAgentPrompt(schema)
        const prompt = ChatPromptTemplate.fromMessages([
            ("system", prompts),
            new MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            new MessagesPlaceholder("agent_scratchpad"),
        ]);



        const dataAnalyzer = new DynamicTool({
            name: "data_analyzer",
            description: "Analyze the data and generate insights, take the data extrected from db using sql query and user refined query,it return the insights",
            func: async (query) => {
                console.log(query)
                const result = main(session_doc.DB_response?session_doc.DB_response:[], model, query);
                return result
            }
        });

        const queryGenerator = new DynamicTool({
            name: "sql_query_generator",
            description: "Generate SQL queries using refined user input and return, take user input as input and return the SQL query",
            func: async (input) => {
                console.log("Input to the sql_query_generator: ", input);
                const result =  await sqlQueryGenerator(input,session_doc,dbDetail);
                return result
            }
        });

        const customDataExtractor = new DynamicTool({
            name: "data_extractor",
            description: "Fetch data from the database using the SQL query, take sql query as input and return the data",
            func: async (input) => {
                // const data = convertJsonToCsv(session_doc.DB_response?session_doc.DB_response:[]);
                console.log("Input to the data_extractor: ", input);
                const sql_result = await queryExecuter(dbDetail, input);

                if (sql_result && sql_result.length > 0) {
                    session_doc.SQL_query = input;
                    session_doc.DB_response = sql_result;
                    
                    return "data generated succesfully from data base and saved insession doc, now call the data_analyzer tool with user requirment";
            }else{
                return "getting error in fetching data from db"
            }
        }
    });

        const tools = [queryGenerator,customDataExtractor,dataAnalyzer];

        const agent = await createOpenAIFunctionsAgent({
            llm: model,
            prompt,
            tools,
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

        
        console.log("Agent response:", response);

        
       
        session_doc.agent_history = `${session_doc.summary?session_doc.summary:response.output}`
        session_doc.agent = session_doc.summary?session_doc.summary:response.output


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
                    const result = convertJsonToCsv(sql_result);
                    return result;
                    }
                 else {
                    if (sql_result?.message?.includes("ETIMEDOUT")) {
                        attempt++;
                        return await executeQuery(query);
                    } else {
                        const newQuery = await error_handler(query, dbDetail, sql_result, model);
                        attempt++;
                        return await executeQuery(newQuery);
                    }
                }
            } catch (error) {
                console.error("Error in custom tool function: ", error);
                attempt++;
                return await executeQuery(query);
            }
        };

        const query = input.trim(); // Ensure input is the SQL query
        return await executeQuery(query);
    }
}






async function generateInsightsFromBulk(data, model, query) {
    try {

        const dataInput = ``


        // Create a prompt message array for the model
        const prompt = `
        You are a highly experienced data analyst with 10+ years of expertise in analyzing business data and providing actionable insights. 
        Below is the dataset and context for your analysis. Perform a thorough analysis and provide a detailed report with the following:
        CONTEXT : ${query}
        DATA : ${data}

        Analysis Requirements:
        1.Trend Analysis: Identify overall sales trends (increasing, decreasing, or stable). Highlight any seasonal patterns or anomalies.Compare performance between categories (Electronics vs. Apparel).
        2.Performance Drivers: Analyze the impact of returns and cancellations on sales.Identify key drivers of sales growth or decline.
        3.Weaknesses and Risks: Point out areas where the business is underperforming (e.g., high returns, low sales in specific categories).Highlight potential risks (e.g., declining sales in a category, high cancellation rates).
        4.Actionable Recommendations:Suggest the best approach to improve performance (e.g., marketing strategies, product improvements, customer retention). Provide specific steps to address weaknesses and capitalize on strengths.
        5.Visual Insights (Descriptive): Describe trends and patterns as if visualizing them (e.g., "Sales in Electronics peaked in the second week but dropped sharply in the third week").Use comparisons and percentages to make insights clear (e.g., "Apparel sales increased by 8.2% in the second week").

        
        Example Output:

        Executive Summary:
            Electronics sales fluctuated significantly, while Apparel sales remained stable.
            High return rates in Apparel indicate potential issues with product quality or customer satisfaction.
        Trend Analysis:
            Electronics sales peaked in the second week ($13,500) but dropped by 18.5% in the third week.
            Apparel sales showed consistent growth, with an 8.2% increase in the second week.
        Weaknesses and Risks:
            Apparel has a high return rate (10 returns in the first week), which may hurt profitability.
            Electronics sales are inconsistent, indicating potential supply or demand issues.
        Recommendations:
            Improve product quality and customer service for Apparel to reduce returns.
            Run targeted promotions for Electronics to stabilize sales.
            Conduct customer surveys to identify reasons for cancellations.
        Conclusion:
            Focus on stabilizing Electronics sales and reducing Apparel returns to drive overall growth.
            Monitor weekly trends closely to identify and address issues early.
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
        // if(dbDetail.isPincone && dbDetail.indexName){
        //     try {
        //         dbDetail.schema = await retrieveRelevantSchema(input, dbDetail.indexName);
        //     } catch (error) {
        //         console.error("Error fetching schema or updating the database:", error);
        //     }
        // }
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



