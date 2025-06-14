import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query(text: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  } finally {
    client.release();
  }
}
