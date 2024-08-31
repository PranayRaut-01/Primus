import mysql from 'mysql2/promise';
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js";

async function createDb(config) {
    try {
            const databaseName = config.database; // Replace with your desired database name
        
            // Connect to MySQL without specifying the database
            const connection = await mysql.createConnection({
                host: config.host, // Replace with your AWS MySQL host URL
                user: config.username, // Replace with your MySQL username
                password: config.password // Replace with your MySQL password
            });
        
            try {
                // Create the database if it doesn't exist
                await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\`;`);
                console.log(`Database '${databaseName}' created or already exists.`);
        
                // Switch to the newly created database
                await connection.query(`USE \`${databaseName}\`;`);
                console.log(`Switched to database '${databaseName}'.`);

                return true
                
            } catch (error) {
                console.error('Error:', error.message);
            } finally {
                // Close the connection
                await connection.end();
            }

            return true
    } catch (err) {
        console.error(err)
        return false
    }
}
async function testConnection(dbDetail) {
    try {

        const table = await fetchSchemaFromDb(dbDetail);

        if(Array.isArray(table) && table.length > 0){
            return {message :"database connected succesfully", connection : true, table:table};
        }else{
            return {connection : false, message:table}

        }
        
    } catch (error) {
        // If an error occurs, log the error message and return false
        console.error('Connection Error:', error.message);
        return {connection : false, message:error.message}
    }
}

export {
    createDb,
    testConnection
}