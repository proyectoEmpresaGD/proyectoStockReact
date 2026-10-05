export async function ensureUserAccessSchema(pool) {
    await pool.query(`
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS route_access JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await pool.query(`
        UPDATE usuarios
        SET route_access = '{}'::jsonb
        WHERE route_access IS NULL;
    `);
}
