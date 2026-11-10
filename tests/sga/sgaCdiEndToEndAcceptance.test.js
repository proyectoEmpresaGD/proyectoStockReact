/** Integración local completa, con CDI simulado. NUNCA conecta al ERP real. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';
import { createSgaCdiPickingCheckpointService, assertSavedPickingMatches } from '../../server/services/sgaCdiPickingCheckpoints.js';

const order = { tipo: 'PC', anio: '2026', serie: 'A', clave: '000020' };
const date = '2026-11-06';
const leaseToken = randomUUID();
const company = 'BD000099';
const picks = [
    { idlinea: '1', cantidad: '4,00', nserie: 'PZ-1', ubicacion: 'A1' },
    { idlinea: '1', cantidad: '1,50', nserie: 'PZ-2', ubicacion: 'A2' },
    { idlinea: '2', cantidad: '2', nserie: 'LIBRO-1', ubicacion: 'B1' },
];
const progress = () => ({ picks: structuredClone(picks), docSettings: { fecha: date, serie_destino: 'A', codalmacen: '01' } });
const write = () => ({ ...order, ...progress().docSettings, leaseToken,
    lineas: picks.map((p) => ({ ...p, cantidad: p.cantidad.replace(',', '.') })) });
const pending = (served) => ({ ok: true, token: served ? 'TOKEN2' : 'TOKEN1', lineas: served
    ? [{ idlinea: '2', codarticulo: 'LIBRO', cantidad_pendiente: '1' }]
    : [{ idlinea: '1', codarticulo: 'TEJIDO', cantidad_pendiente: '5.5' }, { idlinea: '2', codarticulo: 'LIBRO', cantidad_pendiente: '3' }] });
const acIdentity = { tipo: 'AC', anio: '2026', serie: 'A', clave: '000044' };
const acDoc = (mismatch = false) => ({ ok: true, tipo: 'AC', cabecera: { ...acIdentity, codalmacen: '01' }, lineas: [
    { codarticulo: 'TEJIDO', cantidad: '4', nserie: 'PZ-1', ubicacion: 'A1' },
    { codarticulo: 'TEJIDO', cantidad: mismatch ? '1.6' : '1.5', nserie: 'PZ-2', ubicacion: 'A2' },
    { codarticulo: 'LIBRO', cantidad: '2', nserie: 'LIBRO-1', ubicacion: 'B1' },
] });

class TestPostgres {
    operations = new Map(); checkpoints = new Map();
    async query(sql, p = []) {
        const q = String(sql).replace(/\s+/g, ' ').toLowerCase();
        if (q.includes('create table') || q.includes('alter table') || q.includes('create unique index')) return { rows: [] };
        if (q.includes('select operator_id, progress_data')) {
            const item = this.checkpoints.get(`${p[0]}|${p[1]}`);
            return { rows: item ? [structuredClone(item)] : [] };
        }
        if (q.includes('insert into sga_cdi_picking_checkpoints')) {
            const k = `${p[0]}|${p[1]}`;
            if (this.checkpoints.has(k)) return { rows: [] };
            this.checkpoints.set(k, { operator_id: p[2], progress_data: JSON.parse(p[4]), version: 1, status: 'ACTIVE' });
            return { rows: [{ version: 1 }] };
        }
        if (q.includes('set status=\'archived\'')) {
            const k = `${p[0]}|${p[1]}`;
            const item = this.checkpoints.get(k);
            if (!item) return { rows: [] };
            item.status = 'ARCHIVED'; return { rows: [{ version: item.version }] };
        }
        if (q.includes("set state='verified'")) {
            const item = this.operations.get(p[0]);
            if (item && item.company === p[1] && ['CONFIRMED','VERIFIED_PENDING','CHECK_PENDING'].includes(item.state)) item.state = 'VERIFIED';
            return { rows: [] };
        }
        if (q.includes('insert into sga_cdi_test_operations')) {
            const [id, companyId, operator_id, idempotency_key, rawWrite, rawBefore, key] = p;
            if ([...this.operations.values()].some((r) => r.order_key === key && ['PREPARED','SENDING','CONFIRMED'].includes(r.state))) throw Object.assign(Error('unique'), { code: '23505' });
            this.operations.set(id, { id, company: companyId, operator_id, idempotency_key, order_key: key,
                write_data: JSON.parse(rawWrite), before_data: JSON.parse(rawBefore), state: 'PREPARED',
                result_data: null, after_data: null, verification_data: null, document_data: null, document_identity: null });
            return { rows: [] };
        }
        if (q.includes('select id, state, before_data') && q.includes('before_data->')) {
            return { rows: [...this.operations.values()].filter((r) => r.company === p[0] && r.before_data.identity.tipo === p[1]
                && r.before_data.identity.anio === p[2] && r.before_data.identity.serie === p[3] && r.before_data.identity.clave === p[4]) };
        }
        if (q.includes('select * from sga_cdi_test_operations')) {
            const record = this.operations.get(p[0]);
            return { rows: record && record.operator_id === p[1] ? [record] : [] };
        }
        if (q.includes('select id, operator_id, state')) return { rows: [...this.operations.values()].filter((r) => r.document_data) };
        if (q.includes('select id, state, company')) return { rows: [...this.operations.values()] };
        if (q.includes('set state=\'sending\'')) {
            const record = this.operations.get(p[0]);
            if (!record || record.state !== 'PREPARED') return { rows: [] };
            record.state = 'SENDING'; return { rows: [structuredClone(record)] };
        }
        const record = this.operations.get(p[0]);
        if (!record) throw Error(`No record found for ${q}`);
        if (q.includes('set after_data=')) {
            record.after_data = JSON.parse(p[1]); record.verification_data = JSON.parse(p[2]); record.state = p[3];
        } else if (q.includes('set document_data=')) {
            record.document_data = JSON.parse(p[1]); record.document_identity = JSON.parse(p[2]);
        } else if (q.includes('set state=\'confirmed\'')) {
            record.state = 'CONFIRMED'; record.result_data = JSON.parse(p[1]);
        } else if (q.includes('set state=$2')) {
            record.state = p[1]; record.error_code = p[2];
        } else throw Error(`SQL inesperado ${q}`);
        return { rows: [] };
    }
}

for (const mismatch of [false, true]) test(`flujo integral: pedido -> guardado -> bloqueo -> AC -> verificación ${mismatch ? 'con discrepancia' : 'correcta'}`, async () => {
    const pool = new TestPostgres(); let served = false; let sent = 0;
    const locks = { verify: async ({ token, userId, orderKey }) => ({
        ok: token === leaseToken && userId === 'admin' && orderKey === `CDI|${company}|2026|PC|A|000020`,
    }) };
    const client = { status: () => ({ enabled: true, testCompany: company }), invoke: async (fn, data, key) => {
        if (fn.endsWith('documentos.listar')) return { ok: true, documentos: [order] };
        if (fn.endsWith('pedidos.pendientes')) return pending(served);
        if (fn.endsWith('documentos.obtener')) return data.tipo === 'PC' ? { ok: true, cabecera: order, lineas: [] } : acDoc(mismatch);
        if (fn.endsWith('pedidos.servir')) {
            assert.equal(pool.operations.size, 1, 'Debe existir el registro previo en PostgreSQL');
            assert.equal([...pool.operations.values()][0].idempotency_key, key);
            assert.equal(data.lineas.length, 3);
            sent++; served = true; return { ok: true, albaran: acIdentity };
        }
        throw Error(`Función CDI inesperada ${fn}`);
    } };
    const operations = createSgaCdiTestOperations({ pool, client, locks, uuid: randomUUID });
    const checkpoints = createSgaCdiPickingCheckpointService({ pool, locks, testStatus: () => operations.status() });
    assert.equal((await operations.readiness()).ready, true);
    const saved = await checkpoints.save({ identity: order, leaseToken, progress: progress(), version: 0 }, 'admin');
    assert.equal(saved.checkpoint.version, 1);
    const request = { ...write(), checkpointVersion: 1 };
    const current = await checkpoints.read(order, 'admin', leaseToken);
    assertSavedPickingMatches(current.checkpoint, request);
    const prepared = await operations.preparePickingForOperator(request, 'admin');
    assert.equal(prepared.state, 'PREPARED');
    await assert.rejects(operations.preparePickingForOperator(request, 'admin'), { code: 'CDI_TEST_UNFINISHED_ORDER' });
    const result = await operations.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', leaseToken);
    assert.equal(sent, 1);
    assert.equal(result.handoff.status, mismatch ? 'DOCUMENT_LINES_MISMATCH' : 'READY_FOR_ERP_INVOICING');
    if (!mismatch) assert.equal(result.state, 'VERIFIED', 'Un parcial verificado cierra el intento anterior sin marcar automáticamente todo el PC servido.');
    assert.equal(result.handoff.invoiceCreated, false);
    assert.equal(result.handoff.orderCompleted, mismatch ? undefined : false);
    await assert.rejects(operations.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', leaseToken), { code: 'CDI_TEST_ALREADY_SENT' });
    if (mismatch) {
        await assert.rejects(checkpoints.archive({ identity: order, leaseToken, operationId: prepared.id }, 'admin', operations), { code: 'CDI_CHECKPOINT_NOT_VERIFIED' });
    } else {
        const archived = await checkpoints.archive({ identity: order, leaseToken, operationId: prepared.id }, 'admin', operations);
        assert.equal(archived.archived, true);
        assert.equal((await checkpoints.read(order, 'admin', leaseToken)).checkpoint, null);
    }
    assert.equal((await operations.invoiceHandoffs()).handoffs[0].review.status, result.handoff.status);
});
