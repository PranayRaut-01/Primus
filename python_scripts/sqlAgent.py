from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Dict, Any
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.callbacks.manager import get_openai_callback
import os
from dotenv import load_dotenv
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import traceback 
import json

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Thread pool for async operations
executor = ThreadPoolExecutor(max_workers=3)

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
                sql_query: 'SELECT orderNumber, orderDate, quantityOrdered, priceEach\n' +
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
        traceback.print_exc()
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