import mysql, { Pool } from "mysql2/promise";

export const db: Pool = mysql.createPool({
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT), // convert to number
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,

  waitForConnections: true,
  connectionLimit: 10,
});
