import { queryExecuter } from "./connectClientDb.js"
// IMPORT CLIENT DB SCHEMA


async function fetchMSSQLTableSchemas(dbDetail) {
  try {
    const query = `
      SELECT TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name,
       DATA_TYPE AS data_type,
       COLUMN_KEY AS column_key,
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
      SELECT TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name,
       DATA_TYPE AS data_type,
       COLUMN_KEY AS column_key,
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


async function fetchMySQLTableSchemas(dbDetail) {
  try {
//     const query = `
//       SELECT 
//     TABLES.TABLE_NAME AS 'Table Name',
//     COLUMNS.COLUMN_NAME AS 'Column Name',
//     COLUMNS.COLUMN_TYPE AS 'Column Type',
//     COLUMNS.IS_NULLABLE AS 'Is Nullable',
//     COLUMNS.COLUMN_KEY AS 'Column Key',
//     COLUMNS.COLUMN_DEFAULT AS 'Default Value',
//     COLUMNS.EXTRA AS 'Extra Info',
//     IFNULL(CONSTRAINTS.REFERENCED_TABLE_NAME, 'NULL') AS 'Referenced Table',
//     IFNULL(CONSTRAINTS.REFERENCED_COLUMN_NAME, 'NULL') AS 'Referenced Column',
//     IFNULL(CONSTRAINTS.CONSTRAINT_NAME, 'NULL') AS 'Constraint Name'
// FROM 
//     INFORMATION_SCHEMA.COLUMNS AS COLUMNS
// LEFT JOIN 
//     INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS CONSTRAINTS 
//     ON COLUMNS.TABLE_SCHEMA = CONSTRAINTS.TABLE_SCHEMA
//     AND COLUMNS.TABLE_NAME = CONSTRAINTS.TABLE_NAME
//     AND COLUMNS.COLUMN_NAME = CONSTRAINTS.COLUMN_NAME
// LEFT JOIN 
//     INFORMATION_SCHEMA.TABLES AS TABLES
//     ON COLUMNS.TABLE_NAME = TABLES.TABLE_NAME
// WHERE 
//     TABLES.TABLE_SCHEMA = ?
// ORDER BY 
//     TABLES.TABLE_NAME, COLUMNS.ORDINAL_POSITION;

//     `;


    const query = `
    SELECT TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name,
       DATA_TYPE AS data_type,
       COLUMN_KEY AS column_key,
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;

    `
    
    const result = await queryExecuter(dbDetail, query);
    // console.log('MySQL Schema:', result);
    return result;
  } catch (err) {
    console.error('Error fetching MySQL table schemas:', err);
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
      }else if(dbDetail.dbtype == 'mysql'){
        const data = await fetchMySQLTableSchemas(dbDetail)
        return data
      }else{

      }
  } catch (err) {
    console.log(err)
  }
}

export{
  fetchSchemaFromDb
}



