const { OpenAI } = require("langchain/llms/openai");
const { SQLDatabase } = require("langchain/sql_db");
const { ChatPromptTemplate } = require("langchain/prompts");
const { getOpenAICallback } = require("langchain/callbacks");

// Helper function to initialize the SQL database
const initializeDatabase = (connectionString) => SQLDatabase.fromURI(connectionString);

// Helper function to initialize the OpenAI language model
const initializeLanguageModel = (openaiApiKey) => {
    process.env.OPENAI_API_KEY = openaiApiKey;
    return new OpenAI({
        model: "gpt-3.5-turbo",
        temperature: 0,
    });
};

// Helper function to create the base prompt template
const createBasePrompt = () => ChatPromptTemplate.fromMessages([
    ("system", `You are an expert SQL assistant that converts natural language to SQL queries.
    
    Database Schema:
    {table_info}
    
    Given the question below and using the schema above, write a SQL query that answers the question.
    Only respond with the SQL query, no explanations.
    
    Rules:
    1. Only use the tables and columns shown in the schema
    2. Make sure the query is valid for {dialect}
    3. You must not put any additional limit unless the user explicitly mentions it.
     
    OUTPUT FORMAT: {
        SQL_query: 'SELECT orderNumber, orderDate, quantityOrdered, priceEach\n +
            FROM orders\n +
            JOIN orderdetails USING (orderNumber)\n +
            WHERE orderDate >= CURDATE();'
        success: true
     }
    
    Question: {input}`),
    ("human", "{input}")
]);

// Helper function to clean up SQL query if it contains markdown
const cleanSQLQuery = (sqlQuery) => {
    if (sqlQuery.includes("```sql")) {
        return sqlQuery.split("```sql")[1].split("```")[0].trim();
    } else if (sqlQuery.includes("```")) {
        return sqlQuery.split("```")[1].split("```")[0].trim();
    }
    return sqlQuery.trim();
};

// Main function to execute the query
const executeQuery = async (db, llm, basePrompt, naturalLanguageQuery) => {
    try {
        const promptResponse = await llm.invoke(
            basePrompt.format({
                input: naturalLanguageQuery,
                table_info: db.getTableInfo(),
                dialect: db.dialect,
            })
        );

        const sqlQuery = cleanSQLQuery(promptResponse.content);

        const callback = getOpenAICallback();
        const metadata = {
            token_usage: {
                total_tokens: callback.totalTokens,
                prompt_tokens: callback.promptTokens,
                completion_tokens: callback.completionTokens,
            },
            cost: callback.totalCost,
        };

        return {
            success: true,
            sql_query: sqlQuery,
            metadata,
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            error: error.message,
            sql_query: null,
            metadata: null,
        };
    }
};

// Function to run the query (synchronous)
const runQuery = (connectionString, openaiApiKey, query, topK) => {
    const db = initializeDatabase(connectionString);
    const llm = initializeLanguageModel(openaiApiKey);
    const basePrompt = createBasePrompt();
    return executeQuery(db, llm, basePrompt, query, topK);
};

// Function to run the query asynchronously
const asyncRunQuery = async (connectionString, openaiApiKey, query, topK) => {
    return new Promise((resolve, reject) => {
        try {
            const result = runQuery(connectionString, openaiApiKey, query, topK);
            resolve(result);
        } catch (error) {
            reject(error);
        }
    });
};

// Example usage
module.exports = {
    asyncRunQuery
}