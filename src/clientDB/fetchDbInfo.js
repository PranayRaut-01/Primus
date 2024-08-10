import { executeMssqlQuery, executePgSqlQuery } from "./connectClientDb"
// IMPORT CLIENT DB SCHEMA


async function fetchMSSQLTableSchemas() {
  try {
    const query = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_NAME, ORDINAL_POSITION`;

    const result = await executeMssqlQuery(query)
    console.log('MSSQL Schema:', schema);
    return result.recordset;
  } catch (err) {
    console.error('Error fetching MSSQL table schemas:', err);
  }
}


async function fetchPGSQLTableSchemas() {
  try {
    const query = `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      ORDER BY table_name, ordinal_position`;

    const result = await executePgSqlQuery(query)
    console.log('PostgreSQL Schema:', result.rows);
    return result.rows;
  } catch (err) {
    console.error('Error fetching PostgreSQL table schemas:', err);
  }
}


async function fetchSchemaFromDb(dbtype) {
  try {
    if (process.env.SERVER_ENV == "dev") {
      if (dbtype == "mssql") {
        return await fetchMSSQLTableSchemas()
      }
      if (dbtype == "pgqsl") {
        return await fetchPGSQLTableSchemas()
      }
    }

  } catch (err) {
    console.log(err)
  }
}

export{
  fetchSchemaFromDb
}



