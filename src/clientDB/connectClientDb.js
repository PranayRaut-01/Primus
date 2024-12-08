import sql from "mssql";
import pkg from 'pg';
const { Pool } = pkg;
import mysql from 'mysql2/promise';


async function initializeMsSqlConnection(config) {
  try {
    const mssqlConnection = sql.connect(config);
    return {status:true,pool:mssqlConnection}
  } catch (err) {
    console.error('Error initialize to MSSQL:', err);
    return {status:false,error:err.message}
  }
}

async function initializePgSqlConnection(config) {
  try {
    const pgsqlConnection = new Pool(config);
    await pgsqlConnection.connect();
    return {status:true,pool:pgsqlConnection}
  } catch (err) {
    console.error('Error initialize to PostgreSQL:', err);
    return {status:false,error:err.message}
  }
}

async function initializeMySQLConnection(config) {
  try {
    const mysqlConnection = await mysql.createConnection(config);
    console.log('MySQL connection initialized successfully');
    return {status:true,connection:mysqlConnection}
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
      const result = await pool.pool.request().query(query);
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
    const result = await pool.pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error executing PostgreSQL query:', err);
    return err
  }
}


async function executeMySQLQuery(dbDetail, query, formattedRows) {
  try {
    const connection = await initializeMySQLConnection(dbDetail.config);
    if (!connection.status) {
      return connection.error;
    }
    
    const [rows] = formattedRows.length==0?await connection.connection.execute(query, [dbDetail.config.database]):await connection.connection.query(query, formattedRows);
   
    await connection.connection.end();
    return rows;
  } catch (err) {
    console.error('Error executing MySQL query:', err);
    return err;
  }
}


async function queryExecuter(dbDetail,query,formattedRows=[]){
  try {
    if(dbDetail.dbtype == 'mssql'){
      return await executeMssqlQuery(dbDetail,query,formattedRows)
    }
    else if(dbDetail.dbtype == 'postgresql'){
      return await executePgSqlQuery(dbDetail,query,formattedRows)
    }
    else if(dbDetail.dbtype == 'mysql'){
      return await executeMySQLQuery(dbDetail,query,formattedRows)
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

