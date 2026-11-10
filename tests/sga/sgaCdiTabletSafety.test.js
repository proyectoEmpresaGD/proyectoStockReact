import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';

const identity = { tipo: 'PC', anio: '2026', serie: 'A', clave: '00002' };
const id = randomUUID();
const token = randomUUID();
const company = 'BD000099';
const orderKey = `CDI|${company}|2026|PC|A|00002`;
const row = () => ({ id, company, operator_id: 'operario-1', state: 'PREPARED',
    idempotency_key: `SGA-TEST-${id}`, order_key: orderKey,
    before_data: { identity, sgaLease: { token, orderKey } },
    write_data: { ...identity, token: 'CDI-V1', fecha: '2026-11-09', serie_destino: 'A', codalmacen: '01',
        lineas: [{ idlinea: '1', cantidad: '2' }] },
    result_data: null, after_data: null, verification_data: null,
    document_data: null, document_identity: null,
});
function fixture({ pilot = false } = {}) {
    const record = row();
    let outbound = 0;
    const queries = [];
    const pool = { query: async (sql, params = []) => {
        const q = String(sql).replace(/\s+/g, ' ').toLowerCase();
        queries.push(q);
        if (q.includes('create table') || q.includes('alter table') || q.includes('create unique index')) return { rows: [] };
        if (q.includes('select * from sga_cdi_test_operations')) return { rows: params[0] === id && params[1] === record.operator_id ? [structuredClone(record)] : [] };
        if (q.includes('select id from sga_cdi_test_operations') && q.includes('order_key=$2')) return { rows: record ? [{ id }] : [] };
        if (q.includes("set state='paused'")) {
            if (record.state !== 'PREPARED') return { rows: [] };
            record.state = 'PAUSED'; record.before_data.pause = JSON.parse(params[3]);
            return { rows: [{ id }] };
        }
        if (q.includes("set before_data=jsonb_set")) {
            if (!['PREPARED', 'PAUSED'].includes(record.state)) return { rows: [] };
            record.state = 'PREPARED'; record.before_data.sgaLease = JSON.parse(params[3]);
            record.before_data.physicalReview = JSON.parse(params[4]); return { rows: [{ id }] };
        }
        if (q.includes("set state='sending'")) {
            if (record.state !== 'PREPARED') return { rows: [] };
            record.state = 'SENDING'; return { rows: [structuredClone(record)] };
        }
        throw Error(`Consulta inesperada: ${q}`);
    } };
    const client = { status: () => ({ enabled: true, testCompany: company,
        pilot, allowedOrder: identity }),
        assertPilotOrder: (input) => { if (JSON.stringify(input) !== JSON.stringify(identity)) throw Error('Pedido no permitido'); },
        invoke: async (fn) => { if (fn.endsWith('pedidos.servir')) outbound++; throw Error('CDI no debe contactarse en este ensayo'); },
    };
    const locks = { verify: async ({ orderKey: k, token: t, userId }) => ({ ok: k === orderKey && t === token && userId === 'operario-1' }) };
    return { service: createSgaCdiTestOperations({ pool, client, locks }), record, queries, getOutbound: () => outbound };
}

test('tablet: una preparación en PAUSED no puede convertirse en albarán ni duplicarse', async () => {
    const f = fixture();
    const paused = await f.service.pausePrepared(id, 'operario-1', token, 'Pendiente de revisar los productos por unidades.');
    assert.equal(paused.state, 'PAUSED');
    await assert.rejects(() => f.service.commit(id, 'operario-1', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', token),
        { code: 'CDI_TEST_ALREADY_SENT' });
    assert.equal(f.getOutbound(), 0);
    await assert.rejects(() => f.service.pausePrepared(id, 'operario-1', token, 'Segunda pausa de la misma preparación.'),
        { code: 'CDI_TEST_PAUSE_FORBIDDEN' });
    const resumed = await f.service.resumePrepared(id, 'operario-1', token, 'He revisado las piezas y las unidades pendientes.');
    assert.equal(resumed.state, 'PREPARED');
    assert.ok(resumed.before.physicalReview?.reason);
    assert.equal(f.getOutbound(), 0);
});

test('piloto: se bloquea un segundo albarán aunque el primero ya estuviera verificado', async () => {
    const f = fixture({ pilot: true });
    await assert.rejects(() => f.service.preparePickingForOperator({ ...identity, leaseToken: token }, 'operario-1'),
        { code: 'CDI_PILOT_ALREADY_USED' });
    assert.equal(f.getOutbound(), 0);
    assert.ok(f.queries.some((q) => q.includes('select id from sga_cdi_test_operations') && q.includes('order_key=$2')));
});

test('el esquema protege también PAUSED y VERIFIED_PENDING entre tablets', async () => {
    const f = fixture();
    await f.service.ensureStorage();
    assert.ok(f.queries.some((q) => q.includes('sga_cdi_test_active_order_v2_once') && q.includes("'paused'") && q.includes("'verified_pending'")));
});
