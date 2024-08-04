import sql from "mssql";
import pkg from 'pg';
const { Pool } = pkg;
import {msSqlConfig,pgSqlConfig} from '../../config/clientDB'

let mssqlConnection = null;
let pgsqlConnection = null;

async function initializeMsSqlConnection() {
  if (mssqlConnection) {
    return mssqlConnection;
  }
  try {
    const config = await msSqlConfig()
    mssqlConnection = sql.connect(config);
    return mssqlConnection;
  } catch (err) {
    console.error('Error initialize to MSSQL:', err);
  }
}

async function initializePgSqlConnection() {
  if (pgsqlConnection) {
    return pgsqlConnection;
  }
  try {
    const config = pgSqlConfig();
    pgsqlConnection = new Pool(config);
    await pgsqlConnection.connect();
    return pgsqlConnection;
  } catch (err) {
    console.error('Error initialize to PostgreSQL:', err);
  }
}

async function executeMssqlQuery(query) {
    try {
      const pool = await initializeMsSqlConnection();
      const result = await pool.request().query(query);
      return result.recordset;
    } catch (err) {
      console.error('Error executing MSSQL query:', err);
    }
  }

async function executePgSqlQuery(query) {
  try {
    const pool = await initializePgSqlConnection();
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error executing PostgreSQL query:', err);
  }
}

export {
    executeMssqlQuery,
    executePgSqlQuery
}

