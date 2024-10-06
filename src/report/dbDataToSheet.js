import AWS from 'aws-sdk';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from "dotenv";
import { uploadToS3 } from '../controller/uploadToS3.js';
dotenv.config();

// Replacement for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Convert JSON to Excel
async function convertJsonToExcel(json, filePath){
    try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // Get headers from the first object in the JSON array
    const headers = Object.keys(json[0]);
    worksheet.columns = headers.map(header => ({ header, key: header }));

    // Add rows from JSON data
    json.forEach(data => {
        worksheet.addRow(data);
    });

    await workbook.xlsx.writeFile(filePath);
    } catch (error) {
        console.error(`Error converting file from convertJsonToExcel: ${error.message}`)
    } 
};


// Main function
async function main(jsonData){
    try {
    const timestamp = new Date().toISOString().replace(/[:\-]/g, '').replace(/\..+/, '');
    const fileName = `output_${timestamp}.xlsx`;
    const filePath = path.join(__dirname, fileName);

    // Convert JSON to Excel
    await convertJsonToExcel(jsonData, filePath);

    // Upload to S3
    const bucketName = process.env.BUCKET_NAME;
    const key = `${fileName}`; // The key is the file path in the S3 bucket
     // Set S3 upload parameters
     const params = {
        Bucket: bucketName,                   // S3 bucket name
        Key: key,                             // The file path/key in the S3 bucket
        filePath: filePath,                   // Local file path to upload
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  // Content type for Excel file                     
    };
    const sheetUrl = await uploadToS3(params);

    // Clean up the file after upload
    fs.unlinkSync(filePath); 
    return sheetUrl;
    } catch (err) {
        console.error(`Error converting file from main: ${err.message}`)
    }
};

export {
    main
}
