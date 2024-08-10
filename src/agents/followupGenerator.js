import { initializeModel } from '../llm_model/llm'
import { ChatPromptTemplate, MessagesPlaceholder} from "@langchain/core/prompts";

function generateFollowupPrompt(userQuery) {
    try {
        return `You are an AI tool designed to act as an analytics and data engineer. Your role is to generate follow-up questions to refine and optimize user queries for more accurate data retrieval.
    When a user asks a question, generate follow-up questions to clarify the query. Ensure the follow-up questions are specific and provide multiple-choice options to help the user narrow down their request.
  
    Examples:
  
     1. User: "Show me the last month subscribers, and weekly revenue generated from the subscription."
     AI: "Which specific time frame would you like to use for the last month subscribers and weekly revenue generated from the subscription?"
     Options:
     1. Last 4 weeks
     2. Last calendar month
     3. Last 30 days

    2. User : "I need information on recent customer feedback and sales performance."
    AI: "What specific aspect of customer feedback and sales performance are you interested in?"
    Options:

    1. Feedback trends over the past month
    2. Sales performance by product category
    3. Overall customer satisfaction ratings

  User Query: {userQuery}
  Follow-Up Question: Provide the list of Follow-Up Question in the format of an array of strings.
  Options:[option_1,option_2,option_3]
  `;
    } catch (error) {
        console.error("Error generating split query prompt", error);
    }
}


async function generateFollowup(userQuery, chat_history) {
    try {
        const model = await initializeModel()
        const prompts = generateFollowupPrompt(userQuery)
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                prompts,
            ],
            new MessagesPlaceholder("chat_history"),
            ["human", "{userQuery}"],
        ]);
        console.log(prompt)
        const chain = prompt.pipe(model);
        const result = await chain.invoke({
            userQuery: 'top saled product',
            chat_history: chat_history,
        });
        return result
    } catch (error) {

    }
}

generateFollowup()

export {
    generateFollowup
}