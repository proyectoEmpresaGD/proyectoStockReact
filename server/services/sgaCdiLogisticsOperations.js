import { randomUUID } from 'node:crypto';
import { LogisticsError, orderIdentity, buildPurchaseReceipt, buildInventoryAdjustment, validateReceiptMasters, validateInventoryMaster } from './sgaCdiLogisticsContracts.js';
import { createSgaCdiLogisticsClient } from './sgaCdiLogisticsClient.js';
const fail = (status, code, message) => { throw new LogisticsError(status, code, message); };
const mapRow = (row) => ({ id: row.id, company: row.company, kind: row.kind, status: row.status,
    request: row.request_data, before: row.before_data, result: row.cdi_result,
    errorCode: row.error_code, createdAt: row.created_at });
export function createSgaCdiLogisticsOperations({ pool, cdi = createSgaCdiLogisticsClient() }) {
    if (!pool) throw new Error('Falta pool PostgreSQL.');
    const company = () => cdi.status().company;
    const status = () => cdi.status();
    const assertAccess = () => { if (!cdi.status().readsEnabled) fail(503, 'SGA_CDI_OFF', 'CDI no está configurado.'); };
    async function listPurchases(query = {}) {
        assertAccess();
        return cdi.invoke('documents', { tipo: 'PP', limite: 50, ...query });
    }
    async function pending(identity) {
        assertAccess(); return cdi.invoke('pending', orderIdentity(identity));
    }
    async function stock(input) {
        assertAccess();
        const { codarticulo, codalmacen, nserie, codubicacion } = input || {};
        if (!codarticulo || !codalmacen) fail(400, 'SGA_STOCK_FIELDS', 'Introduce el artículo y almacén.');
        return cdi.invoke('stock', { codarticulo, codalmacen, ...(nserie ? { nserie } : {}), ...(codubicacion ? { codubicacion } : {}), limite: 100 });
    }
    async function persist(kind, key, operator, request, before) {
        const id = randomUUID();
        try {
            const { rows } = await pool.query(`INSERT INTO sga_cdi_logistics_operations
              (id, company, kind, resource_key, operator_id, status, idempotency_key, request_data, before_data)
              VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8) RETURNING *`,
                [id, company(), kind, key, operator, `SGA-LOG-${id}`, JSON.stringify(request), JSON.stringify(before)]);
            return mapRow(rows[0]);
        } catch (e) {
            if (e.code === '23505') fail(409, 'SGA_OPERATION_EXISTS', 'Ya hay una operación abierta para este pedido o saldo. Recupera esa operación antes de continuar.');
            throw e;
        }
    }
    async function prepareReceipt(input, operator) {
        if (!status().writesEnabled) fail(403, 'SGA_READ_ONLY', 'Las recepciones reales solo se habilitan en CDI TEST autorizado.');
        const identity = orderIdentity(input?.identity);
        const latest = await pending(identity);
        const pendingLines = latest?.lineas ?? latest?.pedido?.lineas ?? latest?.datos?.lineas;
        if (!Array.isArray(pendingLines)) fail(422, 'SGA_LINES_UNKNOWN', 'CDI no ha devuelto las líneas del pedido.');
        const ids = new Set((input.lineas || []).map((l) => String(l.idlinea)));
        const articles = [...new Set(pendingLines.filter((r) => ids.has(String(r.idlinea)))
            .map((r) => String(r.codarticulo || r.codprodu || '')))].filter(Boolean);
        const masters = {};
        for (const code of articles) {
            const result = await cdi.invoke('master', { entidad: 'ARTICULO', codarticulo: code });
            masters[code] = result?.registro;
        }
        validateReceiptMasters(input, latest, masters);
        // La empresa identifica cada pieza con un lote único. No reutilizar un
        // código de pieza que CDI ya conozca, aunque tenga saldo cero.
        const pieces = (input.lineas || []).filter((r) => r.nserie);
        if (pieces.length > 30) fail(422, 'SGA_TOO_MANY_PIECES', 'Recibe las piezas en lotes de como máximo 30 para comprobar su unicidad.');
        const lookup = new Map(pendingLines.map((r) => [String(r.idlinea), String(r.codarticulo || r.codprodu || '')]));
        for (const piece of pieces) {
            const codarticulo = lookup.get(String(piece.idlinea));
            const found = await cdi.invoke('stock', { codarticulo, nserie: piece.nserie, limite: 100 });
            if (!Array.isArray(found?.existencias) || found.cursor_siguiente || found.hay_mas === true) {
                fail(422, 'SGA_LOT_CHECK_INCOMPLETE', 'No se ha podido comprobar que el lote sea nuevo en CDI.');
            }
            if (found.existencias.some((r) => String(r.codarticulo || '') === codarticulo && String(r.nserie || '') === String(piece.nserie))) {
                fail(409, 'SGA_EXISTING_LOT', `El lote ${piece.nserie} ya existe para el artículo ${codarticulo}.`);
            }
        }
        const { payload, before } = buildPurchaseReceipt(input, latest);
        const key = Object.values(identity).join('|');
        return persist('RECEIPT', key, operator, payload, before);
    }
    async function prepareInventory(input, operator) {
        if (!status().writesEnabled) fail(403, 'SGA_READ_ONLY', 'Los recuentos reales solo se habilitan en CDI TEST autorizado.');
        const [masterResponse, latest] = await Promise.all([
            cdi.invoke('master', { entidad: 'ARTICULO', codarticulo: input.codarticulo }),
            stock(input),
        ]);
        const article = masterResponse?.registro;
        if (!article?.umedidac) fail(422, 'SGA_UNIT_UNKNOWN', 'CDI no ha devuelto la unidad base del artículo.');
        const unitResponse = await cdi.invoke('master', { entidad: 'UNIDAD', umedida: article.umedidac });
        validateInventoryMaster(input, article, unitResponse?.registro);
        const { payload, before } = buildInventoryAdjustment(input, latest);
        const key = [before.codalmacen, before.codarticulo, before.nserie || '', before.codubicacion || ''].join('|');
        const id = randomUUID();
        // CDI exige referencia <=20, y es una referencia permanente para conciliación.
        payload.referencia = `SGA${id.replace(/-/g, '').slice(0, 17)}`;
        return persist('INVENTORY', key, operator, payload, before);
    }
    async function read(id, operator) {
        const { rows } = await pool.query('SELECT * FROM sga_cdi_logistics_operations WHERE id=$1 AND operator_id=$2 AND company=$3', [id, operator, company()]);
        if (!rows.length) fail(404, 'SGA_NOT_FOUND', 'No se encuentra esa operación.');
        return mapRow(rows[0]);
    }
    async function mine(operator) {
        const { rows } = await pool.query(`SELECT * FROM sga_cdi_logistics_operations WHERE operator_id=$1 AND company=$2 ORDER BY created_at DESC LIMIT 25`, [operator, company()]);
        return rows.map(mapRow);
    }
    async function commit(id, operator, confirmation) {
        if (!status().writesEnabled) fail(403, 'SGA_READ_ONLY', 'Escritura no habilitada.');
        if (confirmation !== 'CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO') fail(400, 'SGA_CONFIRMATION', 'Debes confirmar expresamente el envío de ensayo.');
        // Transición atómica y exclusiva. El envío HTTP ocurre DESPUÉS del commit.
        const { rows } = await pool.query(`UPDATE sga_cdi_logistics_operations SET status='SENDING', sent_at=now(), updated_at=now()
            WHERE id=$1 AND operator_id=$2 AND company=$3 AND status='DRAFT' RETURNING *`, [id, operator, company()]);
        if (!rows.length) fail(409, 'SGA_ALREADY_SENT', 'La operación ya fue enviada o está siendo revisada. No vuelvas a enviarla.');
        const row = rows[0];
        let state = 'CHECK_PENDING', result = null, errorCode = null;
        try {
            result = await cdi.invoke(row.kind === 'RECEIPT' ? 'receipt' : 'inventory', row.request_data, row.idempotency_key);
            state = 'ACKNOWLEDGED'; // Nunca equivale por sí mismo a documento/stock verificado.
        } catch (e) {
            state = e instanceof LogisticsError && !e.uncertain && e.status < 500 ? 'REJECTED' : 'CHECK_PENDING';
            errorCode = e instanceof LogisticsError ? e.code : 'SGA_UNKNOWN_ERROR';
        }
        await pool.query(`UPDATE sga_cdi_logistics_operations SET status=$2,cdi_result=$3,error_code=$4,updated_at=now()
            WHERE id=$1 AND status='SENDING'`, [id, state, result ? JSON.stringify(result) : null, errorCode]);
        return read(id, operator);
    }
    async function inspect(id, operator) {
        const item = await read(id, operator);
        if (item.status === 'DRAFT') return { item, note: 'Todavía no se ha enviado a CDI.' };
        if (item.kind === 'INVENTORY') {
            const response = await cdi.invoke('operation', { origen: 'SGA', referencia: item.request.referencia });
            return { item, cdi: response, note: 'Comprueba referencia y diferencias contra el movimiento CDI antes de darlo por finalizado.' };
        }
        const response = await pending(item.request);
        return { item, cdi: response, note: 'Comprueba el pendiente y el AP en CDI. Una diferencia de saldo no identifica por sí sola el documento.' };
    }
    return Object.freeze({ status, listPurchases, pending, stock, prepareReceipt, prepareInventory, read, mine, commit, inspect });
}
