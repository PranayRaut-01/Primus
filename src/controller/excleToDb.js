import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { fetchSchemaFromDb } from '../clientDB/fetchDbInfo.js'

// Create a __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function saveDataFromExcleToDb(req, res, dbDetail) {
    try {
        const tableName = "table1";
        const filePath = req.file.path
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

        const [headers, ...rows] = sheetData;
        if (!headers || headers.length === 0) {
            throw new Error('The Excel file appears to be empty or malformed.');
        }

        // Check for empty columns
        const nonEmptyColumnIndexes = headers
            .map((header, index) => index)
            .filter(index => rows.some(row => row[index] !== undefined && row[index] !== null && row[index] !== ''));

        if (nonEmptyColumnIndexes.length === 0) {
            throw new Error('No valid columns found with data.');
        }

        // Filter out only non-empty columns
        const filteredHeaders = await Promise.all(nonEmptyColumnIndexes.map(index => sanitizeColumnName(headers[index])));
        //  console.log(filteredHeaders)
        const filteredRows = await Promise.all(rows.map(row => nonEmptyColumnIndexes.map(index => row[index])))
        console.log(filteredRows)

        // Determine the data type for each column based on sample data
        const columnTypes = await Promise.all(
            filteredHeaders.map((header, index) => getColumnType(filteredRows.map(row => row[index])))
        );
        console.log(columnTypes)

        // // Construct the SQL schema creation query
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS \`${tableName}\` (
                ${filteredHeaders.map((header, index) => `\`${header}\` ${columnTypes[index]}`).join(',\n')}
            );
        `;

        // Connect to MySQL database
        const connection = await mysql.createConnection(dbDetail.config);

        const tableList = await connection.query(`SHOW TABLES;`);

        if (tableList.length > 0) {
            await connection.query(`DROP TABLE IF EXISTS \`${tableName}\`;`);
        }

        // Log the number of columns vs. number of values
        console.log('Columns:', filteredHeaders);
        console.log('Number of columns:', filteredHeaders.length);
        console.log('Number of values for each row:', filteredRows.map(row => row.length));


        // Create the table
        await connection.query(createTableQuery);

        // Insert data into the table
        const insertDataQuery = `
            INSERT INTO \`${tableName}\` (${filteredHeaders.map(header => `\`${header}\``).join(', ')})
            VALUES ?;
        `;

        const values = filteredRows.map(row => row.map(value => value !== undefined ? value : null));

        console.log(values)

        const insertedData = await connection.query(insertDataQuery, [values]);

        if (!insertedData[0].affectedRows > 0) {
            console.log('Data not inserted successfully.');
        } 

        // Close the MySQL connection
        await connection.end();

        // Clean up the uploaded file
        fs.unlinkSync(filePath);

        const dbTable = await fetchSchemaFromDb(dbDetail);

        if (!dbTable) {
            console.log("unable to create table")
        }

        return dbTable;
    } catch (err) {
        console.error(err)
        return {message : err}
    }
}

async function sanitizeColumnName(name, maxLength = 64) {
    try {
        if (!name) return ''; // Handle null or undefined names
        let sanitized = name.trim();
        sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
        if (sanitized.length > maxLength) {
            console.warn(`Column name '${name}' is too long and will be truncated.`);
            sanitized = sanitized.substring(0, maxLength);
        }
        sanitized = sanitized.trim();
        return sanitized.toLowercase();
    } catch (err) {
        console.error("Error sanitizing column name:", err);
        return ''; 
    }
}


async function getColumnType(sampleData) {
    try {
        // Ensure all values are of string type for .includes() checks
        const allValues = sampleData.map(value => value == null ? '' : String(value));

        // Check if all values are boolean
        if (allValues.every(value => value === 'true' || value === 'false')) return 'BOOLEAN';

        // Check if all values are integers
        if (allValues.every(value => !isNaN(parseInt(value)) && value === String(parseInt(value)))) return 'INT';

        // Check if all values are floats
        if (allValues.every(value => !isNaN(parseFloat(value)) && value === String(parseFloat(value)))) return 'FLOAT';

        // Check if all values are dates in 'YYYY-MM-DD' format
        if (allValues.every(value => !isNaN(Date.parse(value)) && value.includes('-'))) return 'DATE';

        // Check if all values are datetimes in 'YYYY-MM-DDTHH:MM:SS' format
        if (allValues.every(value => !isNaN(Date.parse(value)) && value.includes('T'))) return 'DATETIME';

        // Default to VARCHAR if none of the above conditions are met
        return 'VARCHAR(255)';
    } catch (err) {
        console.error(err)
    }
};

export {
    saveDataFromExcleToDb
}