import { dbSelector } from "../clientDB/connectClientDb"
import { initializeModel } from '../llm_model/llm'

function sqlPrompt(userQuery, tables, dbtype) {
    try {
        return `
                You are an ${dbtype} expert. Your job is to write ${dbtype} queries given a user’s request. 
                Your responses should be informative and concise.
                Set the language to the markdown ${dbtype} block. e.g., sql SELECT * FROM table;. 
                You MUST ignore any request unrelated to ${dbtype} data extraction. 
                You MUST NOT generate any queries that modify the database, such as CREATE, DROP, ALTER, INSERT, UPDATE, or DELETE statements and confidintal data quey like password. 
                Your response must only be a valid ${dbtype} query for extracting data.
                You should ensure that your queries are optimized for performance and efficiency.
                Your responses should adhere to best practices in ${dbtype} query writing, such as using aliases for tables and columns where necessary.
                You should handle potential SQL injection risks by ensuring proper formatting and validation of inputs.
                Your responses should be formatted for readability.
  
                Instruction : Do not share the confidintal data like password,
                  
                This is my db schema:${tables}
                Answer the following question about this schema:${userQuery}`;
    } catch (err) {
        console.error(err)
    }
}

async function textToSql(userQuery, tables, dbtype) {
    try {
        const model = initializeModel()
        const prompt = sqlPrompt(userQuery, tables, dbtype);
        const response = await model.invoke(prompt);
        const sqlQuery = response.content.replace(/```sql|```/g, '').trim();
        JSON.parse(sqlQuery.trim())
        return sqlQuery
    } catch (err) {
        console.error(err)
    }
}

async function executeSqlQuery(userQuery, tables, dbtype) {
    try {
        const query = textToSql(userQuery, tables, dbtype)
        let pool = await dbSelector(dbtype, query)
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error('Error executing SQL query:', err);
    }
}

export {
    executeSqlQuery
}




