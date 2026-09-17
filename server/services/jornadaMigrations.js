import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '../db/migrations');
const MIGRATION_LOCK_KEY = 'cjm_jornada_migrations_v4';
const REQUIRED_TABLES = [
    'jornada_eventos',
    'jornada_incidencias',
    'jornada_correcciones',
    'jornada_auditoria',
    'jornada_politicas_registro',
    'jornada_inspeccion_exports',
    'jornada_asignaciones',
];

const checksum = (text) => crypto.createHash('sha256').update(text).digest('hex');

let readyPromise = null;

const assertRequiredTables = async (client) => {
    const result = await client.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])`,
        [REQUIRED_TABLES]
    );
    const existing = new Set(result.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((tableName) => !existing.has(tableName));

    if (missing.length) {
        const error = new Error(
            `El esquema de Jornada está incompleto. Faltan: ${missing.join(', ')}. ` +
            'Comprueba que 001, 002, 003 y 004 están presentes y vuelve a ejecutar npm run db:jornada:init.'
        );
        error.code = 'JORNADA_SCHEMA_INCOMPLETE';
        error.missingTables = missing;
        throw error;
    }
};

export const applyJornadaMigrations = async (pool) => {
    if (!pool?.connect) {
        throw new Error('El pool PostgreSQL no permite conexiones. Comprueba DATABASE_URL.');
    }

    const client = await pool.connect();
    let lockAcquired = false;

    try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
        lockAcquired = true;

        await client.query(`
            CREATE TABLE IF NOT EXISTS jornada_schema_migrations (
                filename TEXT PRIMARY KEY,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
            )
        `);

        let files;
        try {
            files = (await fs.readdir(migrationsDir))
                .filter((name) => /^\d+_jornada_.*\.sql$/i.test(name))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        } catch (error) {
            error.message = `No se pudo leer el directorio de migraciones de Jornada (${migrationsDir}): ${error.message}`;
            throw error;
        }

        if (!files.includes('001_jornada_v1.sql')) {
            const error = new Error(
                'Falta server/db/migrations/001_jornada_v1.sql. ' +
                'Esa migración crea jornada_eventos y jornada_incidencias y es obligatoria.'
            );
            error.code = 'JORNADA_BASE_MIGRATION_MISSING';
            throw error;
        }

        for (const filename of files) {
            const migrationPath = path.join(migrationsDir, filename);
            const sql = await fs.readFile(migrationPath, 'utf8');
            const currentChecksum = checksum(sql);
            const existing = await client.query(
                'SELECT checksum FROM jornada_schema_migrations WHERE filename = $1',
                [filename]
            );

            if (existing.rows[0]) {
                if (existing.rows[0].checksum !== currentChecksum) {
                    const error = new Error(
                        `La migración ${filename} ya fue aplicada con un contenido diferente. ` +
                        'No se modifica una migración histórica; crea una migración nueva.'
                    );
                    error.code = 'JORNADA_MIGRATION_CHECKSUM_MISMATCH';
                    throw error;
                }
                continue;
            }

            try {
                await client.query(sql);
                await client.query(
                    'INSERT INTO jornada_schema_migrations (filename, checksum) VALUES ($1, $2)',
                    [filename, currentChecksum]
                );
                console.log(`✅ Jornada: ${filename} aplicada.`);
            } catch (error) {
                // Las migraciones contienen BEGIN/COMMIT. Si PostgreSQL falla en medio,
                // limpiamos cualquier transacción abortada antes de devolver el cliente al pool.
                await client.query('ROLLBACK').catch(() => {});
                error.message = `Error aplicando ${filename}: ${error.message}`;
                throw error;
            }
        }

        await assertRequiredTables(client);
        return true;
    } finally {
        if (lockAcquired) {
            await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]).catch(() => {});
        }
        client.release();
    }
};

export const ensureJornadaSchema = (pool) => {
    if (!readyPromise) {
        readyPromise = applyJornadaMigrations(pool).catch((error) => {
            readyPromise = null;
            throw error;
        });
    }
    return readyPromise;
};
