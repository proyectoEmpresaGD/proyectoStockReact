// Asignación exclusiva de pedidos del SGA. ÚNICA escritura: tabla técnica de sesiones.
// No actualiza pedidos, reservas, albaranes ni existencias del ERP.
import { randomUUID } from 'node:crypto';

export const SGA_LOCK_SECONDS = 150;

export const normalizeSgaOrderKey = (value) => {
    if (typeof value !== 'string') return null;
    const key = value.trim().toUpperCase();
    // En la simulación: CANAL|SERIE|NÚMERO. En producción se ampliará
    // a empresa|ejercicio|canal|serie|numero, usando la identidad completa del ERP.
    if (key.length < 5 || key.length > 180 || !/^[\p{L}\p{N}._\-/]+(?:\|[\p{L}\p{N}._\-/]+){2,5}$/u.test(key)) return null;
    return key;
};

export const normalizeSgaLeaseToken = (value) =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value : null;

export function createSgaOrderLockService(pool) {
    let schemaPromise;
    const ensureSchema = () => {
        if (!schemaPromise) {
            schemaPromise = pool.query(`
                CREATE TABLE IF NOT EXISTS sga_order_leases (
                    order_key varchar(180) PRIMARY KEY,
                    user_id varchar(128) NOT NULL,
                    operator_name varchar(200) NOT NULL,
                    lease_token uuid NOT NULL,
                    acquired_at timestamptz NOT NULL DEFAULT NOW(),
                    expires_at timestamptz NOT NULL,
                    updated_at timestamptz NOT NULL DEFAULT NOW()
                )
            `).then(() => pool.query(`
                CREATE TABLE IF NOT EXISTS sga_order_lock_recoveries (
                    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    order_key varchar(180) NOT NULL,
                    previous_user_id varchar(128) NOT NULL,
                    previous_operator varchar(200) NOT NULL,
                    recovered_by_user_id varchar(128) NOT NULL,
                    recovered_by_operator varchar(200) NOT NULL,
                    reason text NOT NULL,
                    recovered_at timestamptz NOT NULL DEFAULT NOW()
                )
            `)).catch((error) => { schemaPromise = null; throw error; });
        }
        return schemaPromise;
    };

    const visible = (row) => row && ({
        orderKey: row.order_key,
        operator: row.operator_name,
        expiresAt: row.expires_at,
        status: row.expired ? 'revision_necesaria' : 'en_preparacion',
    });

    const getHolder = async (orderKey) => {
        const { rows } = await pool.query(`
            SELECT order_key, operator_name, expires_at, expires_at <= NOW() AS expired
              FROM sga_order_leases
             WHERE order_key = $1
        `, [orderKey]);
        return visible(rows[0]);
    };

    const list = async () => {
        await ensureSchema();
        const { rows } = await pool.query(`
            SELECT order_key, operator_name, expires_at, expires_at <= NOW() AS expired
              FROM sga_order_leases
             ORDER BY order_key LIMIT 300
        `);
        return rows.map(visible);
    };

    // ON CONFLICT hace atómica la adquisición incluso si hay varias APIs/servidores.
    const acquire = async ({ orderKey, userId, operator }) => {
        await ensureSchema();
        const token = randomUUID();
        const { rows } = await pool.query(`
            INSERT INTO sga_order_leases (order_key, user_id, operator_name, lease_token, expires_at)
            VALUES ($1, $2, $3, $4::uuid, NOW() + INTERVAL '150 seconds')
            ON CONFLICT (order_key) DO NOTHING
            RETURNING order_key, operator_name, expires_at, false AS expired
        `, [orderKey, String(userId), String(operator).slice(0, 200), token]);
        if (!rows.length) return { ok: false, holder: await getHolder(orderKey) };
        return { ok: true, token, lease: visible(rows[0]), leaseSeconds: SGA_LOCK_SECONDS };
    };

    const renew = async ({ orderKey, userId, token }) => {
        await ensureSchema();
        const { rows } = await pool.query(`
            UPDATE sga_order_leases
               SET expires_at = NOW() + INTERVAL '150 seconds', updated_at = NOW()
             WHERE order_key = $1 AND user_id = $2 AND lease_token = $3::uuid
               AND expires_at > NOW()
            RETURNING order_key, operator_name, expires_at, false AS expired
        `, [orderKey, String(userId), token]);
        return rows.length ? { ok: true, lease: visible(rows[0]) }
            : { ok: false, holder: await getHolder(orderKey) };
    };

    const verify = async ({ orderKey, userId, token }) => {
        await ensureSchema();
        const { rows } = await pool.query(`
            SELECT order_key, operator_name, expires_at, false AS expired
              FROM sga_order_leases
             WHERE order_key = $1 AND user_id = $2 AND lease_token = $3::uuid
               AND expires_at > NOW()
        `, [orderKey, String(userId), token]);
        return rows.length ? { ok: true, lease: visible(rows[0]) }
            : { ok: false, holder: await getHolder(orderKey) };
    };

    const release = async ({ orderKey, userId, token }) => {
        await ensureSchema();
        const { rowCount } = await pool.query(`
            DELETE FROM sga_order_leases
             WHERE order_key = $1 AND user_id = $2 AND lease_token = $3::uuid
               AND expires_at > NOW()
        `, [orderKey, String(userId), token]);
        return rowCount > 0;
    };

    // Un pedido con sesión caducada NO se libera automáticamente: podrían haberse
    // cortado piezas antes de perder la conexión. Requiere revisión física y motivo.
    const recover = async ({ orderKey, userId, operator, reason }) => {
        await ensureSchema();
        const { rows } = await pool.query(`
            WITH removed AS (
                DELETE FROM sga_order_leases
                 WHERE order_key = $1 AND expires_at <= NOW()
                RETURNING order_key, user_id, operator_name
            )
            INSERT INTO sga_order_lock_recoveries (
                order_key, previous_user_id, previous_operator,
                recovered_by_user_id, recovered_by_operator, reason
            )
            SELECT order_key, user_id, operator_name, $2, $3, $4
              FROM removed
            RETURNING order_key
        `, [orderKey, String(userId), String(operator).slice(0, 200), reason]);
        return rows.length ? { ok: true } : { ok: false, holder: await getHolder(orderKey) };
    };
    return { list, acquire, renew, verify, release, recover, ensureSchema };
}
