// server/db/pool.js
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const globalPoolKey = "__pg_pool__";

function createPool() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL no está definida");
    }

    return new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
            process.env.NODE_ENV === "production"
                ? { rejectUnauthorized: false }
                : false,
        max: Number(process.env.PG_POOL_MAX) || 5,
        idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
        connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS) || 8000,
    });
}

const pool =
    globalThis[globalPoolKey] ?? (globalThis[globalPoolKey] = createPool());

export default pool;
