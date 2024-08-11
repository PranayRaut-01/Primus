import { queryExecuter } from "./connectClientDb.js"
// IMPORT CLIENT DB SCHEMA


async function fetchMSSQLTableSchemas(dbDetail) {
  try {
    const query = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_NAME, ORDINAL_POSITION`;

    const result = await queryExecuter(dbDetail,query)
    console.log('MSSQL Schema:', schema);
    return result.recordset;
  } catch (err) {
    console.error('Error fetching MSSQL table schemas:', err);
  }
}


async function fetchPGSQLTableSchemas(dbDetail) {
  try {
    const query = `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
      `
    const result = await queryExecuter(dbDetail,query)
    console.log('PostgreSQL Schema:', result);
    return result;
  } catch (err) {
    console.error('Error fetching PostgreSQL table schemas:', err);
  }
}


async function fetchSchemaFromDb(dbDetail) {
  try {
      if (dbDetail.dbtype == "mssql") {
         const data = await fetchMSSQLTableSchemas(dbDetail)
         return data
      }
      if (dbDetail.dbtype == "postgresql") {
      const data =  await fetchPGSQLTableSchemas(dbDetail)
      return data
      }
  } catch (err) {
    console.log(err)
  }
}

export{
  fetchSchemaFromDb
}



