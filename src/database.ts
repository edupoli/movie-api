// database.ts
import { IMain, IDatabase } from "pg-promise";

const pgp: IMain = require("pg-promise")();
const db: IDatabase<any> = pgp({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

export { db, pgp };
