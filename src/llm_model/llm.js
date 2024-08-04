import { OpenAI } from "@langchain/openai";
import { AzureOpenAI } from "@langchain/openai";
import { openAiConfig, azureOpenAiConfig } from "../../config/llm";
import * as dotenv from "dotenv";

dotenv.config();

let openAiConnection = null;
let azureOpenAiConnection = null;

async function initializeOpenAiConnection() {
    if(openAiConnection)return openAiConnection;
  try {
    const config = await openAiConfig();
    if (config) {
      openAiConnection = new OpenAI(config);
      console.log("OpenAI connection initialized successfully.");
      return openAiConnection;
    }
  } catch (err) {
    console.error('Error initializing OpenAI connection:', err);
  }
}

async function initializeAzureOpenAiConnection() {
    if(azureOpenAiConnection)return azureOpenAiConnection;
  try {
    const config = await azureOpenAiConfig();
    if (config) {
      azureOpenAiConnection = new AzureOpenAI(config);
      console.log("Azure OpenAI connection initialized successfully.");
      return azureOpenAiConnection;
    }
  } catch (err) {
    console.error('Error initializing Azure OpenAI connection:', err);
  }
}

export async function initializeLlmConnections(usedLLM) {
  try {
    if (process.env.SERVER_ENV == "dev") {
        if(usedLLM == "openai"){
            return await initializeOpenAiConnection();
        }
        if(usedLLM == "azureopenai"){
            return await initializeAzureOpenAiConnection();
        } 
    }
    // Handle other environments and user preferences if needed
  } catch (err) {
    console.error('Error initializing LLM connections:', err);
  }
}

export { openAiConnection, azureOpenAiConnection };
