import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
dotenv.config();

// Replacement for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload file to AWS S3
const uploadToS3 = async (params) => {
    try {
        const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: 'eu-north-1'
        });

        const fileContent = params.fileContent || fs.readFileSync(params.filePath); // Dynamic file content

        // Construct the full S3 parameters
        const s3Params = {
            Bucket: params.Bucket,            // S3 Bucket Name
            Key: params.Key,                  // S3 File Path (Key)
            Body: fileContent,                // Dynamic file content (body)
            ContentType: params.ContentType || 'application/octet-stream', // Dynamic content type with default fallback
            ACL: params.ACL || 'private'      // Optional: ACL (access control), default to 'private'
        };

        const data = await s3.upload(s3Params).promise();
        console.log(`File uploaded successfully. ${data.Location}`);
        return data.Location;
    } catch (err) {
        console.error(`Error uploading file from uploadToS3: ${err.message}`);
        throw err;  // Propagate error
    }
};

export {
    uploadToS3
};
