import * as dotenv from "dotenv";

dotenv.config();

async function createOpenAiConfig(model, temperature, apiKey) {
  try {
    return {
      model: model,
      temperature: parseFloat(temperature),
      apiKey: apiKey
    }
  } catch (err) {
    console.error('Error creating OpenAI config:', err);
  }
}

async function createAzureOpenAiConfig(model, azureOpenAIApiKey, azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion, temperature) {
  try {
    return {
      model: model,
      azureOpenAIApiKey: azureOpenAIApiKey,
      azureOpenAIApiInstanceName: azureOpenAIApiInstanceName,
      azureOpenAIApiDeploymentName: azureOpenAIApiDeploymentName,
      azureOpenAIApiVersion: azureOpenAIApiVersion,
      temperature: parseFloat(temperature),
    }
  } catch (err) {
    console.error('Error creating Azure OpenAI config:', err);
  }
}

async function openAiConfig() {
  try {
    if (process.env.SERVER_ENV == "dev") {
      return await createOpenAiConfig(
        process.env.OPENAI_MODEL,
        process.env.OPENAI_TEMPERATURE,
        process.env.OPENAI_API_KEY
      );
    }
    // Handle user preferences for API keys
  } catch (err) {
    console.error('Error creating OpenAI config:', err);
  }
}

async function azureOpenAiConfig() {
  try {
    if (process.env.SERVER_ENV == "dev") {
      return await createAzureOpenAiConfig(
        process.env.AZURE_MODEL,
        process.env.AZURE_OPENAI_API_KEY,
        process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        process.env.AZURE_OPENAI_API_VERSION,
        process.env.AZURE_TEMPERATURE
      );
    }
    // Handle user preferences for API keys
  } catch (err) {
    console.error('Error creating Azure OpenAI config:', err);
  }
}

async function getModelConfig() {
  try {
    if (process.env.SERVER_ENV == "dev") {
      return await openAiConfig();
    }
    // Handle:
    // 1. If user doesn't want to use our API key
    // 2. If user wants to use our API key
  } catch (err) {
    console.error('Error getting model config:', err);
  }
}

export {
  openAiConfig,
  azureOpenAiConfig
}
