import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Parser } from 'json2csv';

// Constants
const CHUNK_SIZE = 500;
const ANALYSIS_PROMPT = ` 
    
        Analysis Requirements:
        1.Trend Analysis: Identify overall sales trends (increasing, decreasing, or stable). Highlight any seasonal patterns or anomalies.Compare performance between categories (Electronics vs. Apparel).
        2.Performance Drivers: Analyze the impact of returns and cancellations on sales.Identify key drivers of sales growth or decline.
        3.Weaknesses and Risks: Point out areas where the business is underperforming (e.g., high returns, low sales in specific categories).Highlight potential risks (e.g., declining sales in a category, high cancellation rates).
        4.Actionable Recommendations:Suggest the best approach to improve performance (e.g., marketing strategies, product improvements, customer retention). Provide specific steps to address weaknesses and capitalize on strengths.
        5.Visual Insights (Descriptive): Describe trends and patterns as if visualizing them (e.g., "Sales in Electronics peaked in the second week but dropped sharply in the third week").Use comparisons and percentages to make insights clear (e.g., "Apparel sales increased by 8.2% in the second week").

        
        Example Output-

        Executive Summary:
            Electronics sales fluctuated significantly, while Apparel sales remained stable.
            High return rates in Apparel indicate potential issues with product quality or customer satisfaction.
        Trend Analysis:
            Electronics sales peaked in the second week ($13,500) but dropped by 18.5% in the third week.
            Apparel sales showed consistent growth, with an 8.2% increase in the second week.
        Weaknesses and Risks:
            Apparel has a high return rate (10 returns in the first week), which may hurt profitability.
            Electronics sales are inconsistent, indicating potential supply or demand issues.
        Recommendations:
            Improve product quality and customer service for Apparel to reduce returns.
            Run targeted promotions for Electronics to stabilize sales.
            Conduct customer surveys to identify reasons for cancellations.
        Conclusion:
            Focus on stabilizing Electronics sales and reducing Apparel returns to drive overall growth.
            Monitor weekly trends closely to identify and address issues early.`; // Insert full prompt from question


async function convertJsonToCsv(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Invalid JSON schema data");
    }

    try {
        const parser = new Parser();
        const csv = parser.parse(data);
        return csv;
    } catch (error) {
        console.error("Error converting JSON to CSV:", error.message);
        return null;
    }
}

// Helper function to split dataset into chunks
const chunkData = (dataset, chunkSize) => {
  return Array.from({ length: Math.ceil(dataset.length / chunkSize) }, (_, i) =>
    dataset.slice(i * chunkSize, (i + 1) * chunkSize)
  );
};

// Analyze a single chunk of data
const analyzeChunk = async (chunk, chunkIndex,model,query) => {

  const data = await convertJsonToCsv(chunk)

  const analysisPrompt = `Analyze this data chunk (rows ${chunkIndex * CHUNK_SIZE + 1}-${chunkIndex * CHUNK_SIZE + chunk.length}):
  ${data}
  
  Extract key insights about:
  - Sales trends and patterns
  - Category comparisons (Electronics vs Apparel)
  - Return/cancellation rates
  - Significant metrics/percentages
  - Notable anomalies
  
  Format response as bullet points with concrete numbers`;

  const response = await model.invoke([
    new SystemMessage("You are a data analysis specialist skilled in chunk-based processing."),
    new HumanMessage(analysisPrompt),
  ]);

  return response.content;
};

// Process all chunks and accumulate insights
const processChunks = async (chunks,model,query) => {
  const insights = await Promise.all(
    chunks.map((chunk, index) => analyzeChunk(chunk, index, model,query))
  );
  return insights;
};

// Generate final analysis from accumulated insights
const generateFinalAnalysis = async (insights,model,query) => {
 
  const analysisPrompt = `You are a highly experienced data analyst with 10+ years of expertise in analyzing business data and providing actionable insights. 
    context for your analysis. Perform a thorough analysis and provide a detailed report with the following:

    CONTEXT OF ANALYSIS :  ${query}

  Context from all chunks:
  ${insights.join("\n\n")}

  ${ANALYSIS_PROMPT}

  `;

  const response = await model.invoke([
    new SystemMessage("You are an expert business analyst synthesizing chunked data insights."),
    new HumanMessage(analysisPrompt),
  ]);

  return response.content;
};

// Main function to process dataset
const processDataset = async (dataset,model,query) => {
  const chunks = chunkData(dataset, CHUNK_SIZE);
  const insights = await processChunks(chunks,model,query);
  const finalAnalysis = await generateFinalAnalysis(insights,model,query);
  return finalAnalysis;
};

// Usage example
const main = async (dataset,model,query) => {
  // Load your dataset here - example format:
  try {
    const finalReport = await processDataset(dataset,model,query);
    console.log("Final Analysis Report:");
    console.log(finalReport);
  } catch (error) {
    console.error("Error processing dataset:", error);
  }
};

export {
    main
};