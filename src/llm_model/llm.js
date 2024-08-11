import { OpenAI } from "@langchain/openai";
import { AzureOpenAI } from "@langchain/openai";
import { openAiConfig, azureOpenAiConfig } from "../../config/llm.js";
import * as dotenv from "dotenv";

dotenv.config();


async function initializeOpenAiConnection(llm) {
  try {
    if (llm.config) {
      const openAiConnection = new OpenAI(llm.config);
      console.log("OpenAI connection initialized successfully.");
      return openAiConnection;
    }
  } catch (err) {
    console.error('Error initializing OpenAI connection:', err);
  }
}

async function initializeAzureOpenAiConnection(llm) {
  try {
    if (llm.config) {
      const azureOpenAiConnection = new AzureOpenAI(llm.config);
      console.log("Azure OpenAI connection initialized successfully.");
      return azureOpenAiConnection;
    }
  } catch (err) {
    console.error('Error initializing Azure OpenAI connection:', err);
  }
}

 async function initializeModel(llm) {
  try {
    if (process.env.SERVER == "dev") {
        if(llm.usedLLM == "openai"){
            const data =  await initializeOpenAiConnection(llm);
            return data
        }
        if(llm.usedLLM == "azureopenai"){
             const data = await initializeAzureOpenAiConnection(llm);
             return data
        } 
    }
    // Handle other environments and user preferences if needed
  } catch (err) {
    console.error('Error initializing LLM connections:', err);
  }
}

export { initializeModel };
