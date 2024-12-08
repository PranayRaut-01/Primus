import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import fs from 'fs';
import { fileURLToPath } from 'url';
import moment from 'moment';
import path from 'path';
import { dirname } from 'path';
import mongoose from 'mongoose';
const ObjectId = mongoose.Types.ObjectId;
import { fetchDbDetails,createDb } from '../controller/createdb.js'
import { DatabaseCredentials } from '../models/dbCreds.js'

// Create a __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function sheetUpload(req, res) {
    try {
        if (!req.file) {
            throw new Error('No file uploaded. Please upload an Excel or CSV file.');
        }

        const userId = new ObjectId(req.token);
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        if (!['.xlsx', '.xls', '.csv'].includes(fileExtension)) {
            return res.status(400).send({ status: false, message: "Invalid file format. Only Excel or CSV files are allowed." });
        }
        req.body.tableName.toLowerCase()
        const { action, tableName, database } = req.body; // `action` can be "new" or "append"
        const filePath = req.file.path;

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        let [headers, ...rows] = sheetData;
        fs.unlinkSync(filePath);

        if (action === 'new') {
            // Handle new sheet upload
            let clientDbData = await DatabaseCredentials.findOne({ userId: userId, database: userId.toString() })

            if (!clientDbData) {
                clientDbData = await DatabaseCredentials.findOne({ _id: new ObjectId(process.env.DB_ID) })
            }

            const config = {
                userId: userId,
                dbtype: clientDbData.dbtype,
                database: userId.toString(), 
                username: clientDbData.username,
                password: clientDbData.password,
                host: clientDbData.host,
                tableName: tableName
            }
            const dbCreation = await createDb(config)
            if (!dbCreation) {
                throw new Error('some issue while adding data');
            }
            const document = new DatabaseCredentials(config);
            await document.save();
            const dbDetail = await fetchDbDetails({_id:document._id})
            if (!dbDetail.config) {
                return res.status(500).send({status:false, error: 'Server error', message: dbDetail.message });
            }
            await saveDataFromExcelToDb(req, res, sheetData, dbDetail);
            return res.status(200).send({ status: true, message: "New sheet uploaded and table created successfully." });
        } else if (action === 'append') {

            const dbDetail = await fetchDbDetails({userId:userId,tableName:tableName})
            if (!dbDetail.config) {
                return res.status(500).send({status: false,  error: 'Server error', message: dbDetail.message });
            }
            // Handle appending data to existing table
            if (!tableName) throw new Error('Table name is required for appending data.');

            const existingSchema = dbDetail.schema

            if(headers.length !== existingSchema.length){
                return res.status(400).send({ status: false, message: "The uploaded sheet formated is not matched with existing formate" });
            }

            headers = await Promise.all(headers.map(index => sanitizeColumnName(index)));

            for(let i=0;i<existingSchema.length;i++){
                if(existingSchema[i]['column_name'] !== headers[i].toLowerCase()){
                return res.status(400).send({ status: false, message: "The uploaded sheet columns sequence is incorrect, Please arrange it in correct sequence" });
                }
            }

            const result = await saveDataFromExcelToDb(req, res, sheetData, dbDetail);
            if(result.status){
                return res.status(200).send({ status: true, message: "Data appended successfully to the existing table." });
            }else{
                res.status(401).send(result);
            }
        } else {
            throw new Error('Invalid action. Use "new" or "append".');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send({ status: false, message: err.message });
    }
}

async function saveDataFromExcelToDb(req, res, sheetData, dbDetail) {
    try {
        const [headers, ...rows] = sheetData;

        if (!headers || headers.length === 0) {
            throw new Error('The uploaded sheet is empty or malformed.');
        }

        // Sanitize column names
        const filteredHeaders = await Promise.all(headers.map(index => sanitizeColumnName(index)));

        // Determine the data type for each column based on sample data
        const columnTypes = await Promise.all(
            filteredHeaders.map((header, colIndex) => getColumnType(rows.map(row => row[colIndex])))
        );

        // Identify date or datetime columns
        const dateColumns = filteredHeaders.reduce((acc, header, index) => {
            if (['DATE', 'DATETIME'].includes(columnTypes[index])) {
                acc.push(index); // Store column indices
            }
            return acc;
        }, []);

        // Format date and datetime values in rows
        const formattedRows = rows
        .filter(row => row.some(value => value !== "" && value !== undefined && value !== null)) // Skip completely empty rows
        .map(row => 
            filteredHeaders.map((_, colIndex) => {
                const value = row[colIndex];
    
                // If the value is empty or undefined, fill it with a default based on data type
                if (value === "" || value === undefined) {
                    return columnTypes[colIndex] === 'DATE'
                        ? null // Null for DATE type
                        : columnTypes[colIndex] === 'DATETIME'
                        ? null // Null for DATETIME type
                        : columnTypes[colIndex] === 'INT' || columnTypes[colIndex] === 'FLOAT'
                        ? 0 // Default to 0 for numeric types
                        : null; // Null for other types
                }
    
                // Handle date columns formatting
                if (dateColumns.includes(colIndex) && value) {
                    const formattedDate = moment(value, moment.ISO_8601, true);
                    if (formattedDate.isValid()) {
                        return columnTypes[colIndex] === 'DATE'
                            ? formattedDate.format('YYYY-MM-DD')
                            : formattedDate.format('YYYY-MM-DD HH:mm:ss');
                    }
                }
    
                return value !== undefined ? value : null; // Handle null or undefined values
            })
        );
    

        // Connect to MySQL database
        const connection = await mysql.createConnection(dbDetail.config);

        if(!connection){
            await DatabaseCredentials.deleteOne({ _id: dbDetail._id });
            return { status: false, message: "database connection time out" }
        }

        // Fetch all table names from the database
        const [tables] = await connection.query(`SHOW TABLES`);
        const tableNames = tables.map(row => Object.values(row)[0]);

        const existingTable = tableNames.includes(dbDetail.tableName);

        if (!existingTable) {
            // If table doesn't exist, create it
            const createTableQuery = `
                CREATE TABLE \`${dbDetail.tableName}\` (
                ${filteredHeaders.map((header, index) => `\`${header}\` ${columnTypes[index]}`).join(',\n')}
            );`;

            await connection.query(createTableQuery);

            // Save schema and table name in dbDetail
            let schema = filteredHeaders.map((header, index) => ({
                table_name: dbDetail.tableName,
                column_name: header,
                data_type: columnTypes[index],
            }));
            await DatabaseCredentials.updateOne({ _id:dbDetail._id }, { $set: { schema: schema } })
        }

        // Insert data into the table
        const insertDataQuery = `INSERT INTO \`${dbDetail.tableName}\` (${filteredHeaders.map(header => `\`${header}\``).join(', ')}) VALUES ?;`;
        const insertedData = await connection.query(insertDataQuery, [formattedRows]);

        if (!insertedData[0].affectedRows > 0) {
            console.log('Data not inserted successfully.');
        }

        // Close the MySQL connection
        await connection.end();

        return { status: true}
    } catch (err) {
        console.error(err);
        return { status: false, message: err.message }
    }
}

async function dropTableAndDeleteDbDetail(req, res) {
    try {
        const userId = new ObjectId(req.token);
        const tableName = req.body.tableName.toLowerCase();
        const dbDetail = await fetchDbDetails({userId:userId,tableName:tableName})
        if (!dbDetail.config) {
            return res.status(500).send({ error: 'Server error', message: dbDetail.message });
        }
        // Connect to MySQL
        const connection = await mysql.createConnection(dbDetail.config);

        // Drop the table
        const dropTableQuery = `DROP TABLE IF EXISTS \`${dbDetail.tableName}\``;
        await connection.query(dropTableQuery);
        console.log(`Table '${dbDetail.tableName}' dropped successfully.`);

        // Close the MySQL connection
        await connection.end();

        // Delete the dbDetail document from MongoDB
        const deleteResult = await DatabaseCredentials.deleteOne({ _id: dbDetail._id });
        if (deleteResult.deletedCount > 0) {
            console.log(`Document with ID '${dbDetail._id}' deleted successfully from MongoDB.`);
            return res.status(404).send({ status: false, message:`Sheet name '${tableName}' not found`});

        } else {
            // console.warn(`Document with ID '${dbDetail._id}' not found in MongoDB.`);
            return res.status(200).send({ status: true, message: `Sheet name '${tableName}' delete successfully`});

        }
    } catch (err) {
        console.error('Error during table drop and document deletion:', err);
        res.status(500).send({ status: false, message: err.message });
    }
}


async function sanitizeColumnName(name, maxLength = 64) {
    try {
        if (!name) return; // Handle null or undefined names
        let sanitized = name.trim();
        sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
        if (sanitized.length > maxLength) {
            console.warn(`Column name '${name}' is too long and will be truncated.`);
            sanitized = sanitized.substring(0, maxLength);
        }
        sanitized = sanitized?.trim();
        return sanitized?.toLowerCase();
    } catch (err) {
        console.error("Error sanitizing column name:", err);
        return '';
    }
}


async function getColumnType(sampleData) {
    try {
        // Use only the first 2-3 elements for type detection
        const subset = sampleData.slice(0, 3); // Adjust the number as needed

        // Ensure all values are strings for consistency
        const allValues = subset.map(value => (value == null ? '' : String(value)));

        // Check if all values are boolean
        if (allValues.every(value => value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
            return 'BOOLEAN';
        }

        // Check if all values are integers
        if (allValues.every(value => !isNaN(parseInt(value)) && value === String(parseInt(value)))) {
            return 'INT';
        }

        // Check if all values are floats
        if (allValues.every(value => !isNaN(parseFloat(value)) && value === String(parseFloat(value)))) {
            return 'FLOAT';
        }

        // Check if all values are dates
        if (allValues.every(value => moment(value, moment.ISO_8601, true).isValid())) {
            return 'DATE';
        }

        // Default to VARCHAR if none of the above conditions are met
        return 'VARCHAR(255)';
    } catch (err) {
        console.error("Error determining column type:", err);
    }
}



export {
    sheetUpload,
    dropTableAndDeleteDbDetail
}