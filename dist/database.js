"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgp = exports.db = void 0;
const pgp = require("pg-promise")();
exports.pgp = pgp;
const db = pgp({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "cinemas",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
});
exports.db = db;
//# sourceMappingURL=database.js.map