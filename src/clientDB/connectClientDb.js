import sql from "mssql";
import pkg from 'pg';
const { Pool } = pkg;

async function initializeMsSqlConnection(config) {
  try {
    const mssqlConnection = sql.connect(config);
    return mssqlConnection;
  } catch (err) {
    console.error('Error initialize to MSSQL:', err);
  }
}

async function initializePgSqlConnection(config) {
  try {
    const pgsqlConnection = new Pool(config);
    await pgsqlConnection.connect();
    return pgsqlConnection;
  } catch (err) {
    console.error('Error initialize to PostgreSQL:', err);
  }
}

async function executeMssqlQuery(dbDetail,query) {
    try {
      const pool = await initializeMsSqlConnection(dbDetail.config);
      const result = await pool.request().query(query);
      return result.recordset;
    } catch (err) {
      console.error('Error executing MSSQL query:', err);
    }
  }

async function executePgSqlQuery(dbDetail,query) {
  try {
    const pool = await initializePgSqlConnection(dbDetail.config);
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error executing PostgreSQL query:', err);
  }
}

async function queryExecuter(dbDetail,query){
  try {
    if(dbDetail.dbtype == 'mssql'){
      return await executeMssqlQuery(dbDetail,query)
    }
    else if(dbDetail.dbtype == 'postgresql'){
      return await executePgSqlQuery(dbDetail,query)
    }
    else if(dbDetail.dbtype == 'mysql'){
      return "error"
    }
  } catch (error) {
    console.error(error)
  }
}

export {
  queryExecuter
}

