import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder, } from "@langchain/core/prompts";
import { model } from "../../config/llm.js"


// Create a function to call the Langchain API
async function intentIdentifier(text) {

    const tables = "order,product,users,cart"

    const prompts = ["You are an AI tool designed to act as an analytics and data engineer.",
        "Your current task is to identify the user's query intent.",
        "The goal is to determine whether the user's query is related to generating SQL queries to fetch data from the database or followup question on the last response or if it pertains to a more general unrelated question.",
        "Instructions:",
        "1. Carefully analyze the user's query to understand the context and intention behind it.",
        "2. Determine if the user's query is related to generating SQL queries or fetching data from the database. This includes any request for specific data retrieval, data manipulation",
        "3. If the query is related to SQL query generation or fetching data, inquery about any collection or table details return  'intent : query'.",
        "4. If the query unrelated to the database operations, or does not fit into the scope of generating SQL queries but related to providing data insights of last generated data, return 'intent : followup'.",
        "5. else the query is not relate to both followup or sql query then return, 'intent : general'",
        "6. also mention the reason why intent type query or general or followup in 'reason' key, Make sure to wrap the answer in json and tags, this is very important",
        "Remember, you should not respond to queries that are unrelated to your core functionalities as an analytics and data engineer.",
        "Table details : "
    ].concat(tables).join("\n");


    const prompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            prompts,
        ],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
    ]);

    const chain = prompt.pipe(model);
    const result = await chain.invoke({
        input: text,
        chat_history: chat_history,
    });

    return result
}
const chat_history = [
    new HumanMessage("hi"),
    new AIMessage("Hello! How can I assist you today?"),
    new HumanMessage("my name is prince chouhan"),
    new AIMessage("Nice to meet you, Prince Chouhan! How can I assist you today?"),
    new HumanMessage("what is your role"),
    new AIMessage("I am an LLM-based analytic agent, designed to connect with your database, assist in data retrieval, and provide insights from that data."),
    new HumanMessage("[{\"Product ID\":101,\"Product Name\":\"Wireless Earbuds\",\"Category\":\"Electronics\",\"Units Sold\":1500,\"Price per Unit\":50,\"Total Revenue\":75000},{\"Product ID\":102,\"Product Name\":\"Running Shoes\",\"Category\":\"Footwear\",\"Units Sold\":1200,\"Price per Unit\":80,\"Total Revenue\":96000},{\"Product ID\":103,\"Product Name\":\"Smartwatch\",\"Category\":\"Wearables\",\"Units Sold\":900,\"Price per Unit\":200,\"Total Revenue\":180000},{\"Product ID\":104,\"Product Name\":\"Laptop Backpack\",\"Category\":\"Accessories\",\"Units Sold\":1100,\"Price per Unit\":40,\"Total Revenue\":44000},{\"Product ID\":105,\"Product Name\":\"Electric Toothbrush\",\"Category\":\"Personal Care\",\"Units Sold\":1300,\"Price per Unit\":30,\"Total Revenue\":39000}]"),
]

async function supervisor(userText) {
    try {
        const intent = intentIdentifier(userText, chat_history);
        // NEED TO HANDLE 
        // PASS HANDOVER TO THE APPROPATE AGENT ACCORDING TO USECASE.


    } catch (err) {
        console.error(err)
    }
}

// async function generateQuery(data, dbtype) {
//     const prompt = `
//   You are an SQL expert Just identify the given query.
//   INSTRUCTION 
//   if any error in correct the query correct it and return updated query. 
//   else return same query.

//   NOTE : you are restricted to return only query.
//   QUERY : ${data}
//   `
//     const response = await model.invoke(prompt);
//     console.log(response)
//     const query = response.content.trim(); // Remove any extra whitespace

//     console.log("Generated query:", query);

//     return query; // Return the query directly as a string

// }

export {
    supervisor
}