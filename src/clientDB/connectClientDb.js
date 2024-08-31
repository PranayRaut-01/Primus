import sql from "mssql";
import pkg from 'pg';
const { Pool } = pkg;
import mysql from 'mysql2/promise';


async function initializeMsSqlConnection(config) {
  try {
    const mssqlConnection = sql.connect(config);
    return mssqlConnection;
  } catch (err) {
    console.error('Error initialize to MSSQL:', err);
    return {status:false,error:err.message}
  }
}

async function initializePgSqlConnection(config) {
  try {
    const pgsqlConnection = new Pool(config);
    await pgsqlConnection.connect();
    return pgsqlConnection;
  } catch (err) {
    console.error('Error initialize to PostgreSQL:', err);
    return {status:false,error:err.message}
  }
}

async function initializeMySQLConnection(config) {
  try {
    const mysqlConnection = await mysql.createConnection(config);
    console.log('MySQL connection initialized successfully');
    return mysqlConnection;
  } catch (err) {
    console.error('Error initializing MySQL connection:', err);
    return {status:false,error:err.message}
  }
}


async function executeMssqlQuery(dbDetail,query) {
    try {
      const pool = await initializeMsSqlConnection(dbDetail.config);
      if(!pool.status){
        return pool.error
      }
      const result = await pool.request().query(query);
      return result.recordset;
    } catch (err) {
      console.error('Error executing MSSQL query:', err);
      return err
    }
  }

async function executePgSqlQuery(dbDetail,query) {
  try {
    const pool = await initializePgSqlConnection(dbDetail.config);
    if(!pool.status){
      return pool.error
    }
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error executing PostgreSQL query:', err);
    return err
  }
}


async function executeMySQLQuery(dbDetail, query) {
  try {
    const connection = await initializeMySQLConnection(dbDetail.config);
    if(!connection.status){
      return connection.error
    };
    const [rows] = await connection.execute(query, [dbDetail.config.database]);
    return rows;
  } catch (err) {
    console.error('Error executing MySQL query:', err);
    return err
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
      return await executeMySQLQuery(dbDetail,query)
    }else{
      throw new Error("database not mentioned"); 
    }
  } catch (error) {
    console.error(error)
  }
}

export {
  queryExecuter
}

