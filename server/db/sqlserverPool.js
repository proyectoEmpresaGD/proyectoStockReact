let poolsByDbPromise = new Map();
let sqlModulePromise;

async function loadSqlModule() {
    if (!sqlModulePromise) {
        sqlModulePromise = import('mssql').catch(() => null);
    }
    return sqlModulePromise;
}

function buildConfig(databaseOverride) {
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const server = process.env.DB_SERVER;

    const database = databaseOverride || process.env.DB_NAME || 'CJMW_Web';

    if (!user || !password || !server) return null;

    return {
        user,
        password,
        server,
        database,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    };
}

/**
 * Devuelve cliente a SQL Server.
 * - Sin opts.database => usa DB_NAME (por defecto CJMW_Web)
 * - Con opts.database => usa pool separado cacheado para esa BD (CJMW_202601, etc.)
 */
export async function getSqlServerClient(opts = {}) {
    const mod = await loadSqlModule();
    if (!mod?.default) return null;

    const db = opts.database || null;
    const key = db || '__default__';

    if (!poolsByDbPromise.has(key)) {
        const config = buildConfig(db);
        if (!config) return null;

        const p = new mod.default.ConnectionPool(config).connect().catch((err) => {
            poolsByDbPromise.delete(key);
            throw err;
        });

        poolsByDbPromise.set(key, p);
    }

    const pool = await poolsByDbPromise.get(key);
    return { pool, sql: mod.default, database: db || (process.env.DB_NAME || 'CJMW_Web') };
}
