from flask import Flask, request, jsonify
from langchain_openai import ChatOpenAI
from langchain_experimental.agents.agent_toolkits import create_csv_agent
from langchain.agents.agent_types import AgentType
from typing import Dict, Any
from langchain_community.utilities import SQLDatabase
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.callbacks.manager import get_openai_callback
import os
from dotenv import load_dotenv
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain
import os
import traceback
from typing import Dict, NamedTuple
from datetime import datetime, timedelta


# Initialize Flask app
app = Flask(__name__)

# Thread pool for async operations
executor = ThreadPoolExecutor(max_workers=3)

# Set up OpenAI API Key
os.environ["OPENAI_API_KEY"] = "sk-None-zz8fljEiOBTUj4RMYXvkT3BlbkFJmslGMwI5dESdToC5Smk9"

class UserSession(NamedTuple):
    memory: ConversationBufferMemory
    agent: any
    last_active: datetime

# Global dictionaries to store user sessions and their associated data
user_sessions: Dict[str, Dict[str, UserSession]] = {}

# Session cleanup configuration
SESSION_TIMEOUT = timedelta(hours=1)  # Adjust timeout as needed

# Initialize the LLM
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

def cleanup_old_sessions():
    """Remove inactive sessions that have exceeded the timeout period"""
    current_time = datetime.now()
    for session_id in list(user_sessions.keys()):
        for file_path in list(user_sessions[session_id].keys()):
            if (current_time - user_sessions[session_id][file_path].last_active) > SESSION_TIMEOUT:
                del user_sessions[session_id][file_path]
        if not user_sessions[session_id]:
            del user_sessions[session_id]

def get_or_create_user_session(session_id: str, file_path: str) -> UserSession:
    """Get or create a session for a specific user and CSV file"""
    # Clean up old sessions periodically
    cleanup_old_sessions()
    
    # Initialize session dictionary for user if it doesn't exist
    if session_id not in user_sessions:
        user_sessions[session_id] = {}
    
    # Create new session for this file if it doesn't exist
    if file_path not in user_sessions[session_id]:
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
            output_key="output"
        )
        
        agent = create_csv_agent(
            llm,
            file_path,
            agent_type=AgentType.OPENAI_FUNCTIONS,
            verbose=True,
            memory=memory,
            handle_parsing_errors=True,
            allow_dangerous_code=True,
        )
        
        user_sessions[session_id][file_path] = UserSession(
            memory=memory,
            agent=agent,
            last_active=datetime.now()
        )
    else:
        # Update last active time
        current_session = user_sessions[session_id][file_path]
        user_sessions[session_id][file_path] = current_session._replace(
            last_active=datetime.now()
        )
    
    return user_sessions[session_id][file_path]

def format_conversation_history(memory: ConversationBufferMemory) -> str:
    """Format conversation history for context"""
    chat_history = memory.load_memory_variables({}).get("chat_history", "")
    if not chat_history:
        return ""
    
    formatted_history = "Previous conversation:\n"
    for message in chat_history:
        role = "Human" if message.type == "human" else "Assistant"
        formatted_history += f"{role}: {message.content}\n"
    return formatted_history

@app.route('/get_agent_response', methods=['POST'])
async def get_agent_response():
    try:
        # Get the JSON data from request
        data = request.get_json()
        
        # Check if all required fields are present
        if not all(key in data for key in ['query', 'file_path', 'session_id']):
            return jsonify({
                "error": "Missing required parameters. Need 'query', 'file_path', and 'session_id'"
            }), 400
        
        # Extract the data
        user_query = data['query']
        file_path = data['file_path']
        session_id = data['session_id']
        
        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({"error": "CSV file not found at the provided file path"}), 404

        # Get or create user session
        user_session = get_or_create_user_session(session_id, file_path)
        
        # Get conversation history
        conversation_history = format_conversation_history(user_session.memory)
        
        # Combine conversation history with current query for context
        contextualized_query = f"{conversation_history}\nCurrent question: {user_query}"
        
        # Invoke the agent with the contextualized query
        response = await user_session.agent.ainvoke(
            {"input": contextualized_query},
            return_only_outputs=True
        )

        # Extract the response
        agent_response = response.get("output", "")

        # Save the interaction in memory
        user_session.memory.save_context(
            {"input": user_query},
            {"output": agent_response}
        )

        # Return the response with session information
        return jsonify({
            "response": agent_response,
            "conversation_history": conversation_history,
            "session_id": session_id
        }), 200
    
    except Exception as e:
        error_message = traceback.format_exc()
        print(f"Error: {error_message}")
        return jsonify({
            "error": "An internal server error occurred",
            "details": error_message
        }), 500

@app.route('/clear_session', methods=['POST'])
def clear_session():
    try:
        data = request.get_json()
        
        if 'session_id' not in data:
            return jsonify({"error": "Missing 'session_id' parameter"}), 400
            
        session_id = data['session_id']
        file_path = data.get('file_path')
        
        if session_id in user_sessions:
            if file_path:
                # Clear specific file session
                if file_path in user_sessions[session_id]:
                    del user_sessions[session_id][file_path]
                    message = f"Session cleared for file: {file_path}"
                else:
                    message = "File session not found"
            else:
                # Clear entire user session
                del user_sessions[session_id]
                message = "All sessions cleared for user"
        else:
            message = "Session not found"
            
        return jsonify({
            "message": message,
            "session_id": session_id
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/list_sessions', methods=['GET'])
def list_sessions():
    """List all active sessions and their associated files"""
    cleanup_old_sessions()
    
    sessions_info = {}
    for session_id, files in user_sessions.items():
        sessions_info[session_id] = {
            "files": list(files.keys()),
            "last_active": max(session.last_active.isoformat() 
                             for session in files.values())
        }
    
    return jsonify({"active_sessions": sessions_info}), 200


class SQLQueryAgent:
    def __init__(self, connection_string: str, openai_api_key: str):
        # Set OpenAI API key
        os.environ["OPENAI_API_KEY"] = openai_api_key
        
        # Initialize database connection
        self.db = SQLDatabase.from_uri(connection_string)
        
        # Initialize language model
        self.llm = ChatOpenAI(
            model="gpt-3.5-turbo",
            temperature=0
        )
        
        # Create base prompt template
        self.base_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert SQL assistant that converts natural language to SQL queries.
            
            Database Schema:
            {table_info}
            
            Given the question below and using the schema above, write a SQL query that answers the question.
            Only respond with the SQL query, no explanations.
            
            Rules:
            1. Only use the tables and columns shown in the schema
            2. Make sure the query is valid for {dialect}
            3. You must not put any additional limit untill unless user not mentioned it.
             
            OUTPUT FORMATE : {
                metadata: {
                    cost: 0.001192,
                    token_usage: { completion_tokens: 36, prompt_tokens: 2276, total_tokens: 2312 }
                },
                SQL_query: 'SELECT orderNumber, orderDate, quantityOrdered, priceEach\n' +
                    'FROM orders\n' +
                    'JOIN orderdetails USING (orderNumber)\n' +
                    'WHERE orderDate >= CURDATE();'
                success: true
             }
            
            Question: {input}"""),
            ("human", "{input}")
        ])

    def execute_query(self, natural_language_query: str, top_k: int = 5) -> Dict[str, Any]:
        try:
            # Generate SQL query using the LLM
            with get_openai_callback() as cb:
                prompt_response = self.llm.invoke(
                    self.base_prompt.format(
                        input=natural_language_query,
                        table_info=self.db.get_table_info(),
                        dialect=self.db.dialect,
                        top_k=top_k
                    )
                )
                
                # Extract SQL query from the response
                sql_query = prompt_response.content.strip()
                
                # Clean up SQL query if it contains markdown
                if "```sql" in sql_query:
                    sql_query = sql_query.split("```sql")[1].split("```")[0].strip()
                elif "```" in sql_query:
                    sql_query = sql_query.split("```")[1].split("```")[0].strip()
            
                
            
            # Create response
            response = {
                "success": True,
                "sql_query": sql_query,
                "metadata": {
                    "token_usage": {
                        "total_tokens": cb.total_tokens,
                        "prompt_tokens": cb.prompt_tokens,
                        "completion_tokens": cb.completion_tokens
                    },
                    "cost": cb.total_cost
                }
            }
            
        except Exception as e:
            print(e)
            response = {
                "success": False,
                "error": str(e),
                "sql_query": sql_query if 'sql_query' in locals() else None,
                "result": None,
                "metadata": None
            }
            
        return response

def run_query(connection_string: str, openai_api_key: str, query: str, top_k: int) -> Dict[str, Any]:
    """Execute query in a separate thread"""
    agent = SQLQueryAgent(connection_string, openai_api_key)
    return agent.execute_query(query, top_k)

async def async_run_query(connection_string: str, openai_api_key: str, query: str, top_k: int) -> Dict[str, Any]:
    """Asynchronously execute query using thread pool"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        executor,
        partial(run_query, connection_string, openai_api_key, query, top_k)
    )

@app.route('/query', methods=['POST'])
async def process_query():
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['connection_string', 'query', 'openai_api_key']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Get optional top_k parameter
        top_k = data.get('top_k', 5)
        
        # Execute query asynchronously
        result = await async_run_query(
            data['connection_string'],
            data['openai_api_key'],
            data['query'],
            top_k
        )
        
        if not result['success']:
            return jsonify(result), 400
            
        return jsonify(result)
        
    except Exception as e:
        print(e)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/')
async def root():
    return jsonify({
        'message': 'SQL Query API is running. Use POST /query endpoint to execute queries.'
    })


if __name__ == '__main__':
    # Run the Flask app with async support
    app.run(host='0.0.0.0', port=5000, debug=True)
