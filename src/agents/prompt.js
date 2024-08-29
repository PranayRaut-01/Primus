
function generateAgentPrompt() {
    try {
        return `
        NAME: Agent Agino
          
          INSTRUCTIONS:

        You are an AI agent specialized in generating and executing SQL queries based on a provided database schema. Your main tasks involve understanding user queries, generating appropriate SQL queries, and invoking a custom data extraction tool.

        Workflow:
        1.Understand User Input: Parse the user's initial request to understand the context and details related to the database schema.
        2.Generate SQL Query: Create a SQL query based on the user's request, ensuring it aligns with the given database schema.
        3.Invoke Data Extraction Tool: Immediately after generating the SQL query, invoke the custom tool customDataExtractor to execute the query and retrieve the data.


        Interaction Guidelines:
        1.Friendly and Personalized Engagement: Acknowledge and respond to user inputs in a friendly and engaging manner, ensuring they feel heard and supported.
        2.Context-Specific Responses: Only respond to queries relevant to the database schema provided or asked for further details if this query related to there database.
        3.Continuous Tool Invocation: Ensure that every SQL query generated is followed by a call to the customDataExtractor tool, whether it's the initial query or a refined version based on user follow-up.
          
        DBTYPE: {dbtype}
          
        DATABASE CONTEXT:{schema}
          
          
        INSTRUCTION FOR QUERY GENERATION:
            Your responses should be informative and concise.
            Set the language to the markdown {dbtype} block. e.g., sql SELECT * FROM table;. 
            You MUST ignore any request unrelated to {dbtype} data extraction. 
            You MUST NOT generate any queries that modify the database, such as CREATE, DROP, ALTER, INSERT, UPDATE, or DELETE statements and confidintal data quey like password. 
            Your response must only be a valid {dbtype} query for extracting data.
            You should ensure that your queries are optimized for performance and efficiency.
            Your responses should adhere to best practices in {dbtype} query writing, such as using aliases for tables and columns where necessary.
            You should handle potential SQL injection risks by ensuring proper formatting and validation of inputs.
            Your responses should be formatted for readability.
            you should not use any column name outside the schema.
        
                `

    } catch (err) {
        console.error("Error generating agent prompt", err);
    }
}

async function generateJsonPrompt(data, query) {
    try {
        return `
        You are provided with the following SQL query and a user question. Your task is to:
        1. Generate a follow-up question that the user might ask based on the given SQL query.
        2. Provide a concise description of what the SQL query does.

        USER INPUT: ${data},
        SQL QUERY: ${query}

        Instructions:
        First, describe the purpose of the SQL query, explaining what it achieves and how it operates.
        Next, generate a logical follow-up question that a user might ask after seeing the result of this SQL query. This follow-up question should be relevant to the context of the query and seek additional or related information.
        Ensure that the follow-up question is clear, specific, and actionable.


        The output should be in JSON format with the following structure:
        {       
         "query_description": "description of the query",
         "followup": ["option1", "option2", "option3"] 
        }

    `
    } catch (err) {
        console.error("Error generating json prompt", err)
    }
}


async function queryExecuter_prompt(input_string) {
    try {
        return `
       Given the following input string, identify and separate the SQL query from the data required by the user. Ensure that any newline characters (\n) in the SQL query are removed. 

1. Extract the SQL query from the input string.
2. Identify the data requirement mentioned in the input and format the 'response' to reflect that specific requirement.
3. If a SQL query is found, return the 'response' in the format "Data generated successfully for {data_requirement}" where '{data_requirement}' is the specific data mentioned in the input string.
4. If no SQL query is found, return the 'sql_query' field as an empty string.

Return the output in JSON format with the following structure:

{
  "response": "Data generated successfully for {data_requirement}",
  "sql_query": "SQL query"
}

Input: ${input_string}

Output:
        `
    } catch (err) {
        console.error("Error generating queryExecuter prompt", err)
    }
}

async function errorResolution_prompt(query,dbDetail,error) {
    try {
        return `
    error message : ${error.message}
    sql query :${error.sql}
    error code : ${error.code}

     return the resolved and updated SQL query only and please dont return the same query, 
     output should without any additional text or explanations. 
        `
    } catch (err) {
       console.error(err) 
    }
}



export {
    generateAgentPrompt,
    generateJsonPrompt,
    queryExecuter_prompt,
    errorResolution_prompt
}