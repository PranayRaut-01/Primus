import * as dotenv from "dotenv";
dotenv.config();

async function createMssqlconfig(serverIP, userName, password, databaseName) {
    try {
        return {
            server: serverIP,
            user: userName,
            password: password,
            database: databaseName,
        }
    } catch (err) {
        console.error('Error creating MSSQL config:', err);
    }
}

async function createPgconfig(serverIP, userName, password, databaseName) {
    try {
        return {
            server: serverIP,
            user: userName,
            password: password,
            database: databaseName,
        }
    } catch (err) {
        console.error('Error creating PostgreSQL config:', err);
    }
}

async function msSqlConfig() {
    try {
        if (process.env.SERVER_ENV == "dev") {
            const config = await createMssqlconfig(process.env.MSSQL_SERVER, process.env.MSSQL_USER, process.env.MSSQL_PASSWORD, process.env.MSSQL_DB_NAME);
            return config;
        }
    } catch (err) {
        console.error('Error executing MSSQL config:', err);
    }
}

async function pgSqlConfig() {
    try {
        if (process.env.SERVER_ENV == "dev") {
            const config = await createPgconfig(process.env.PG_SERVER, process.env.PG_USER, process.env.PG_PASSWORD, process.env.PG_DB_NAME);
            return config;
        }
    } catch (err) {
        console.error('Error executing PostgreSQL config:', err);
    }
}

async function clientconfig() {
    try {
        if (process.env.USED_DB == "mssql") {
            return await msSqlConfig();
        }
        if (process.env.USED_DB == "pg") {
            return await pgSqlConfig();
        }
    } catch (err) {
        console.error('Error determining client config:', err);
    }
}


export {
    clientconfig,
    msSqlConfig,
    pgSqlConfig
}
