/**
 * Bitácora independiente para las simulaciones del SGA. No modifica stock ni ERP.
 * El usuario y la fecha se asignan SIEMPRE en el servidor desde la sesión autenticada.
 */

export const SGA_AUDIT_ACTIONS = Object.freeze([
    'PEDIDO_CORTE', 'PEDIDO_CORTE_RETIRADO', 'PEDIDO_PENDIENTE_CONFIRMADO',
    'PEDIDO_DOCUMENTO', 'RECEPCION_PIEZA', 'RECEPCION_PIEZA_RETIRADA',
    'RECEPCION_DOCUMENTO', 'REGULARIZACION_DOCUMENTO',
]);
const ORDER_ACTIONS = new Set(SGA_AUDIT_ACTIONS.filter((value) => value.startsWith('PEDIDO_')));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[\p{L}\p{N}._\-/]+(?:\|[\p{L}\p{N}._\-/]+){0,5}$/u;
const hasText = (value) => typeof value === 'string' && value.trim().length >= 1;

export function validateSgaAuditEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Evento no válido.';
    if (!UUID_RE.test(String(input.eventId || ''))) return 'Identificador del evento no válido.';
    if (!SGA_AUDIT_ACTIONS.includes(input.action)) return 'Tipo de operación no permitido.';
    if (!hasText(input.reference) || input.reference.length > 180 || !KEY_RE.test(input.reference.trim())) {
        return 'La referencia del documento no es válida.';
    }
    if (!input.detail || Array.isArray(input.detail) || typeof input.detail !== 'object') return 'Faltan los detalles de la operación.';
    const encoded = JSON.stringify(input.detail);
    if (!encoded || encoded.length > 5000) return 'Los detalles del evento exceden el tamaño permitido.';
    const q = input.detail.quantity;
    if (['PEDIDO_CORTE', 'RECEPCION_PIEZA'].includes(input.action)) {
        if (!Number.isFinite(q) || q <= 0 || Math.abs(q - Math.round(q * 100) / 100) > 0.000000001) return 'La cantidad debe ser positiva y tener como máximo dos decimales.';
        if (!hasText(input.detail.productCode)) return 'Falta identificar el producto.';
    }
    if (input.action === 'PEDIDO_CORTE') {
        const waste = input.detail.waste;
        if (!['m', 'ud'].includes(input.detail.unit)) return 'Unidad de corte inválida.';
        if (waste !== (input.detail.unit === 'm' ? 0.1 : 0)) return 'La merma registrada no coincide con la regla fija del corte.';
        if (!Number.isFinite(input.detail.stockDeduction) || Math.abs(input.detail.stockDeduction - q - waste) > 0.00001) {
            return 'La cantidad que sale de stock no coincide con corte más merma.';
        }
    }
    if (ORDER_ACTIONS.has(input.action)) {
        if (!hasText(input.orderKey) || input.orderKey.length > 180 || !KEY_RE.test(input.orderKey) || input.orderKey.split('|').length < 3) return 'Identificador de pedido inválido.';
        if (!UUID_RE.test(String(input.leaseToken || ''))) return 'La asignación de pedido no es válida.';
        if (input.reference !== input.orderKey) return 'La referencia no coincide con la asignación del pedido.';
    }
    return null;
}

export function createSgaAuditService(pool) {
    let schemaPromise;
    const ensureSchema = async () => {
        if (!schemaPromise) {
            schemaPromise = pool.query(`
                CREATE TABLE IF NOT EXISTS sga_audit_events (
                    event_id uuid PRIMARY KEY,
                    action varchar(55) NOT NULL,
                    reference varchar(180) NOT NULL,
                    order_key varchar(180),
                    operator_id varchar(128) NOT NULL,
                    operator_name varchar(200) NOT NULL,
                    detail jsonb NOT NULL,
                    simulated boolean NOT NULL DEFAULT true,
                    created_at timestamptz NOT NULL DEFAULT NOW(),
                    CONSTRAINT sga_audit_simulation_only CHECK (simulated = true)
                )
            `).then(() => pool.query(`
                CREATE INDEX IF NOT EXISTS idx_sga_audit_reference_created
                ON sga_audit_events (reference, created_at DESC)
            `)).then(() => pool.query(`
                CREATE INDEX IF NOT EXISTS idx_sga_audit_created
                ON sga_audit_events (created_at DESC)
            `)).catch((error) => { schemaPromise = null; throw error; });
        }
        return schemaPromise;
    };

    const record = async ({ event, userId, username }) => {
        const invalid = validateSgaAuditEvent(event);
        if (invalid) return { ok: false, status: 400, message: invalid };
        await ensureSchema();
        const isOrder = ORDER_ACTIONS.has(event.action);
        const args = [
            event.eventId,
            event.action,
            event.reference.trim(),
            isOrder ? event.orderKey : null,
            String(userId),
            String(username).slice(0, 200),
            JSON.stringify(event.detail),
        ];
        // Para cortes, pendientes y documentos de pedidos se exige un bloqueo de
        // preparación vigente DEL MISMO USUARIO Y TABLET en la misma consulta SQL.
        // No son movimientos reales ni constituyen un mecanismo de reserva de stock.
        const sql = `
            INSERT INTO sga_audit_events
                (event_id, action, reference, order_key, operator_id, operator_name, detail)
            SELECT $1::uuid, $2, $3, $4, $5, $6, $7::jsonb
            ${isOrder ? `WHERE EXISTS (
                SELECT 1 FROM sga_order_leases
                WHERE order_key = $4 AND user_id = $5
                  AND lease_token = $8::uuid AND expires_at > NOW()
            )` : ''}
            ON CONFLICT (event_id) DO NOTHING
            RETURNING event_id, action, reference, operator_name, created_at
        `;
        if (isOrder) args.push(event.leaseToken);
        const { rows } = await pool.query(sql, args);
        if (rows.length) return { ok: true, recorded: true, event: rows[0] };
        const previous = await pool.query(`
            SELECT event_id, action, reference, order_key, operator_id,
                   detail, created_at, operator_name
              FROM sga_audit_events WHERE event_id = $1::uuid
        `, [event.eventId]);
        if (previous.rows.length) {
            const original = previous.rows[0];
            if (original.action === event.action && original.reference === event.reference.trim()
                && original.operator_id === String(userId)
                && original.order_key === (isOrder ? event.orderKey : null)
                && (await pool.query('SELECT $1::jsonb = $2::jsonb AS matches', [JSON.stringify(original.detail), JSON.stringify(event.detail)])).rows[0]?.matches) {
                return { ok: true, recorded: false, event: original };
            }
            return { ok: false, status: 409, message: 'Identificador de evento reutilizado con otros datos.' };
        }
        return { ok: false, status: 409, message: 'Ya no tienes el control exclusivo de este pedido. No se ha registrado la operación.' };
    };

    const list = async ({ limit = 40, offset = 0, reference = '', action = '' } = {}) => {
        await ensureSchema();
        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 40));
        const safeOffset = Math.max(0, Math.min(100000, Number(offset) || 0));
        const ref = String(reference).trim().slice(0, 180);
        const filter = String(action).trim();
        if (filter && !SGA_AUDIT_ACTIONS.includes(filter)) throw Object.assign(new Error('Filtro no válido.'), { status: 400 });
        const { rows } = await pool.query(`
            SELECT event_id AS id, action, reference, order_key AS "orderKey",
                   operator_id AS "operatorId", operator_name AS operator,
                   detail, simulated, created_at AS "createdAt"
            FROM sga_audit_events
            WHERE ($1::text = '' OR reference ILIKE '%' || $1::text || '%'
                OR detail->>'productCode' ILIKE '%' || $1::text || '%'
                OR detail->>'lotCode' ILIKE '%' || $1::text || '%')
              AND ($2::text = '' OR action = $2)
            ORDER BY created_at DESC, event_id DESC
            LIMIT $3 OFFSET $4
        `, [ref, filter, safeLimit, safeOffset]);
        return rows;
    };
    return { ensureSchema, record, list };
}
