import dotenv from 'dotenv';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import openai from 'openai';

const { Configuration, OpenAIApi } = openai; // Ensure you import OpenAI for generating responses

// Load environment variables
dotenv.config();

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-ada-002', 
});

const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  });

async function embedAndStoreSchema(dbDetail,dataset) {
    try {
        const indexname = `${dbDetail.database}-${dbDetail.userId.toString()}`
        await pc.createIndex({
            name: indexname,
            dimension: 1536,
            metric: 'cosine',
            spec: {
              serverless: {
                cloud: 'aws',
                region: 'us-east-1'
              }
            },
            deletionProtection: 'disabled',
        });
        
        const index = pc.index(indexname);
          
        // Create the vector store
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            maxConcurrency: 5,
        });

        for (const [index, row] of dataset.entries()) {
            const schemaText = JSON.stringify(row);

            // Store the embedding in the vector store
            await vectorStore.addDocuments([{ pageContent: schemaText, metadata: { id: `schema_row_${index}` } }], { ids: [`schema_row_${index}`] });
          }

        
        return {
            status: true,
            indexName:indexname
        }
           
    } catch (error) {
        console.error(error);
        return {
            status: false,
            message : error.message
        }
    }
}

async function retrieveRelevantSchema(query, indexName) {
    try {
        // Connect to the Pinecone index
        const index = pc.index(indexName);
        
        // Create the vector store from the existing index
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            maxConcurrency: 5,
        });
        
        // Perform similarity search
        const similaritySearchResults = await vectorStore.similaritySearch(query, 3);

        // Extract and return the relevant schemas
        const relevantSchemas = similaritySearchResults.map((doc) => doc.pageContent);
        console.log('Retrieved relevant schema sections:', relevantSchemas);

        return JSON.stringify(relevantSchemas);
    } catch (error) {
        console.log(error);
        return {
            status: false,
            message: error.message
        };
    }
}
export {
    embedAndStoreSchema,
    retrieveRelevantSchema
}