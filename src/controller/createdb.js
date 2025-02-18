import mysql from 'mysql2/promise';
import { fetchSchemaFromDb } from "../clientDB/fetchDbInfo.js";
import { DatabaseCredentials } from '../models/dbCreds.js'
import * as dotenv from "dotenv";
dotenv.config();

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
        // Log to confirm that the function is reached
        console.log('Fetching schema from the database...');

        // Await for the fetchSchemaFromDb to resolve or reject
        const table = await fetchSchemaFromDb(dbDetail);
        
        // Check if the returned result is an array with elements
        if (Array.isArray(table) && table.length > 0) {
            return {
                message: "Database connected successfully",
                connection: true,
                table: table
            };
        } else {
            return {
                connection: false,
                message: "No tables found or connection failed",
                table: table
            };
        }
    } catch (error) {
        // Log and return the error in case of failure
        console.error('Connection Error:', error.message);
        return {
            connection: false,
            message: error.message
        };
    }
}

async function fetchDbDetails(obj) {
    try {
    
        const dbDetail= await DatabaseCredentials.findOne(obj)
        
        dbDetail.config = {
          user: process.env.USER_NAME,
          password: process.env.PASSWORD,
          database: dbDetail.database
        }
        if (dbDetail.host) {
            dbDetail.config.host = process.env.SERVER
        } else {
            dbDetail.config.server = dbDetail.server
        }
        dbDetail.schema = null
        return dbDetail
    } catch (error) {
        console.error('Connection Error:', error.message);
        return {
            status: false,
            message: error.message
        };
    }
}

function createConnectionString(dbDetail) {
    if (!dbDetail || !dbDetail.config) {
        throw new Error("Invalid database details provided.");
    }

    const { user, password, database, host, server } = dbDetail.config;

    if (!user || !password || !database) {
        throw new Error("Missing required database credentials.");
    }

    let connectionString = "";

    switch (dbDetail.dbtype.toLowerCase()) {
        case "postgresql":
        case "postgres":
            connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host || server}/${database}`;
            break;

        case "mysql":
            connectionString = `mysql+pymysql://${user}:${encodeURIComponent(password)}@${host || server}/${database}`;
            break;

        case "mssql":
        case "sqlserver":
            connectionString = `mssql://${user}:${encodeURIComponent(password)}@${host || server};database=${database}`;
            break;

        default:
            throw new Error("Unsupported database type.");
    }

    return connectionString;
}



export {
    createDb,
    testConnection,
    fetchDbDetails,
    createConnectionString
}