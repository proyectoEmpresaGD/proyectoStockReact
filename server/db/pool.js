// server/db/pool.js
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

let pool;

if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL no definida. La app arrancará pero la DB fallará.");
    pool = {
        async query() {
            throw new Error("DATABASE_URL no definida en Vercel (Env Variables).");
        },
        async end() { },
    };
} else {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
}

export default pool;
