import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSgaAuditService, validateSgaAuditEvent, SGA_AUDIT_ACTIONS } from '../../server/services/sgaAudit.js';

const uuid = 'a120402a-0020-42ed-82d7-7f81480e6201';
const lease = 'a120402a-0020-42ed-82d7-7f81480e6202';
const samplePick = (changes = {}) => ({
    eventId: uuid,
    action: 'PEDIDO_CORTE',
    reference: '01|A|DEMO-24018',
    orderKey: '01|A|DEMO-24018',
    leaseToken: lease,
    detail: { productCode: 'DEMO-TELA-01', lotCode: 'L1', quantity: 3.5, waste: 0.1, stockDeduction: 3.6, unit: 'm' },
    ...changes,
});

test('contrato admite movimientos simulados y validación de merma', () => {
    assert.equal(validateSgaAuditEvent(samplePick()), null);
    assert.equal(validateSgaAuditEvent(samplePick({ detail: { ...samplePick().detail, quantity: -1 } })) !== null, true);
    assert.equal(validateSgaAuditEvent(samplePick({ detail: { ...samplePick().detail, quantity: 3.333 } })) !== null, true);
    assert.equal(validateSgaAuditEvent(samplePick({ detail: { ...samplePick().detail, waste: 0.5 } })) !== null, true);
    assert.equal(validateSgaAuditEvent(samplePick({ detail: { ...samplePick().detail, stockDeduction: 3.5 } })) !== null, true);
    assert.equal(validateSgaAuditEvent(samplePick({ detail: { ...samplePick().detail, unit: 'ud', waste: 0, stockDeduction: 3.5 } })), null);
});

test('bitácora valida identidad de evento, tamaño, referencia y sesión', () => {
    assert.ok(validateSgaAuditEvent(samplePick({ eventId: 'xx' })));
    assert.ok(validateSgaAuditEvent(samplePick({ action: 'BORRAR_STOCK' })));
    assert.ok(validateSgaAuditEvent(samplePick({ reference: 'OTRO|PEDIDO|9' })));
    assert.ok(validateSgaAuditEvent(samplePick({ leaseToken: 'xx' })));
    assert.ok(validateSgaAuditEvent(samplePick({ detail: { notes: 'x'.repeat(6000) } })));
    assert.ok(validateSgaAuditEvent(samplePick({ detail: null })));
    assert.equal(validateSgaAuditEvent({ eventId: uuid, action: 'RECEPCION_PIEZA', reference: 'DEMO-PC-1', detail: { quantity: 12.25, productCode: 'T1' } }), null);
    assert.equal(SGA_AUDIT_ACTIONS.length, 8);
});

test('almacena usuario y fecha del servidor, simulación y bloqueo atómico de pedido', async () => {
    const queries = [];
    const fake = { query: async (sql, args) => {
        queries.push({ sql, args });
        if (sql.includes('INSERT INTO sga_audit_events')) return { rows: [{ event_id: uuid, action: 'PEDIDO_CORTE' }] };
        return { rows: [] };
    } };
    const service = createSgaAuditService(fake);
    const result = await service.record({ event: samplePick(), userId: 17, username: 'Operario de prueba' });
    assert.equal(result.ok, true);
    const insert = queries.find(({sql}) => sql.includes('INSERT INTO sga_audit_events'));
    assert.match(insert.sql, /WHERE EXISTS\s*\(/);
    assert.match(insert.sql, /lease_token = \$8::uuid AND expires_at > NOW\(\)/);
    assert.equal(insert.args[4], '17');
    assert.equal(insert.args[5], 'Operario de prueba');
    assert.equal(insert.args[7], lease);
    assert.match(queries[0].sql, /simulated boolean NOT NULL DEFAULT true/);
});

test('rechaza registrar un corte sin la asignación activa', async () => {
    const fake = { query: async (sql) => ({ rows: [] }) };
    const result = await createSgaAuditService(fake).record({ event: samplePick(), userId: 17, username: 'X' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
});

test('si falla PostgreSQL se rechaza el evento y no se inventa confirmación', async () => {
    const service = createSgaAuditService({ query: async () => { throw new Error('BD caída'); } });
    await assert.rejects(service.record({ event: samplePick(), userId: 17, username: 'X' }), /BD caída/);
});

test('consulta ordenada y paginada del historial, con filtros', async () => {
    const requests = [];
    const service = createSgaAuditService({ query: async (sql, args) => { requests.push({sql, args}); return { rows: [] }; } });
    assert.deepEqual(await service.list({limit: 500, offset: 10, reference: 'PC-3', action: 'RECEPCION_PIEZA'}), []);
    const query = requests.find(({sql}) => sql.includes('FROM sga_audit_events'));
    assert.match(query.sql, /ORDER BY created_at DESC, event_id DESC/);
    assert.deepEqual(query.args, ['PC-3', 'RECEPCION_PIEZA', 100, 10]);
    await assert.rejects(service.list({ action: 'MALICIOSO' }), /Filtro no válido/);
});

test('solo el servidor recibe la identidad autenticada; interfaz registra antes de mutar', () => {
    const router = readFileSync(new URL('../../server/routes/sgaAudit.js', import.meta.url), 'utf8');
    const picking = readFileSync(new URL('../../src/sga/SgaOrderPicking.jsx', import.meta.url), 'utf8');
    const receiving = readFileSync(new URL('../../src/sga/SgaPurchaseReceiving.jsx', import.meta.url), 'utf8');
    const page = readFileSync(new URL('../../src/pages/SgaPage.jsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../server/index.js', import.meta.url), 'utf8');
    assert.match(router, /req\.user\.id/);
    assert.match(router, /req\.user\.username/);
    assert.match(router, /req\.user\.role \|\| ''/);
    assert.match(app, /app\.use\("\/api\/sga\/audit", authMiddleware, createSgaAuditRouter\(\{ pool \}\)\)/);
    assert.match(picking, /await registerPick\(result\.pick\)/);
    assert.match(picking, /await registerOrderAction\('PEDIDO_CORTE_RETIRADO'/);
    assert.match(picking, /await action\(\)/);
    assert.match(receiving, /await logReceipt\('RECEPCION_PIEZA'/);
    assert.match(receiving, /await logReceipt\('RECEPCION_DOCUMENTO'/);
    assert.match(page, /await sgaAuditGateway\.record\(token/);
    assert.match(page, /<SgaAuditHistory token=\{token\}/);
});

test('reintentos con el mismo identificador no crean dos eventos', async () => {
    const details = samplePick().detail;
    const pool = { query: async (sql) => {
        if (sql.includes('INSERT INTO sga_audit_events')) return { rows: [] };
        if (sql.includes('FROM sga_audit_events WHERE event_id')) return { rows: [{
            event_id: uuid, action: 'PEDIDO_CORTE', reference: '01|A|DEMO-24018',
            order_key: '01|A|DEMO-24018', operator_id: '17', detail: details,
        }] };
        if (sql.includes('SELECT $1::jsonb = $2::jsonb')) return { rows: [{ matches: true }] };
        return { rows: [] };
    } };
    const result = await createSgaAuditService(pool).record({ event: samplePick(), userId: 17, username: 'X' });
    assert.equal(result.ok, true);
    assert.equal(result.recorded, false);
});

test('los filtros permiten encontrar el producto o lote sin incluir nombres falsos', async () => {
    const calls=[];
    const service=createSgaAuditService({ query: async (sql,args) => {calls.push(sql);return {rows:[]};} });
    await service.list({ reference: 'DEMO-TELA-01' });
    assert.ok(calls.some((sql) => sql.includes("detail->>'productCode'")));
    assert.ok(calls.some((sql) => sql.includes("detail->>'lotCode'")));
});
