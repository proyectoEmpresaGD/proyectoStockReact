import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCdiTestClient, CdiTestError } from '../../server/services/cdiTestClient.js';
import { buildTestWrite, decimalToUnits, verifyTestPending, createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';

const liveTestEnv = () => ({ CDI_EMPRESA: 'BD000001', CDI_TEST_EMPRESA: 'BD000099', CDI_TEST_API_KEY: 'not-a-real-key', CDI_TEST_WRITES_ENABLED: 'true', CDI_TEST_ENVIRONMENT_CONFIRMED: 'SI_ENTORNO_DE_PRUEBAS' });
const form = () => ({ tipo: 'PP', anio: '2026', serie: 'A', clave: '00001', idlinea: 'L-1', cantidad: '2.25', fecha: '2026-11-05', serie_destino: 'A', codalmacen: '01', nserie: 'LT-01', ubicacion: 'A1' });
const pending = (quantity = '6.250000') => ({ ok: true, token: 'TOKEN01', lineas: [{ idlinea: 'L-1', cantidad_pendiente: quantity }] });

class FakePool {
    constructor() { this.records = new Map(); }
    async query(sql, params = []) {
        const text = String(sql).toLowerCase().replace(/\s+/g, ' ');
        if (text.includes('create table') || text.includes('alter table') || text.includes('create unique index')) return { rows: [] };
        if (text.includes('insert into sga_cdi_test_operations')) {
            const [id, company, operator_id, idempotency_key, write_data, before_data] = params;
            this.records.set(id, { id, company, operator_id, idempotency_key, write_data: JSON.parse(write_data), before_data: JSON.parse(before_data), state: 'PREPARED', created_at: '2026-11-05T00:00:00Z', result_data: null, after_data: null, verification_data: null, error_code: null });
            return { rows: [] };
        }
        if (text.includes('select * from sga_cdi_test_operations')) {
            const [id, userId] = params; const r = this.records.get(id);
            return { rows: r?.operator_id === userId ? [r] : [] };
        }
        if (text.includes('select id, state, company')) {
            return { rows: [...this.records.values()].filter((r) => r.operator_id === params[0]) };
        }
        if (text.includes("update sga_cdi_test_operations set state='sending'")) {
            const [id, userId, company] = params; const r = this.records.get(id);
            const accepted = text.includes("state='prepared'") ? ['PREPARED'] : ['UNCERTAIN','RETRYABLE'];
            if (r?.operator_id !== userId || r?.company !== company || !accepted.includes(r.state)) return { rows: [] };
            r.state = 'SENDING'; return { rows: [structuredClone(r)] };
        }
        if (text.includes('set document_data=')) {
            const [id, document, identity] = params; const r = this.records.get(id);
            Object.assign(r, { document_data: JSON.parse(document), document_identity: JSON.parse(identity) });
            return { rows: [] };
        }
        if (text.includes('set after_data=')) {
            const [id, after, verification, state] = params; const r = this.records.get(id);
            Object.assign(r, { after_data: JSON.parse(after), verification_data: JSON.parse(verification), state });
            return { rows: [] };
        }
        if (text.includes("set state='confirmed'")) {
            const [id, result] = params; const r = this.records.get(id);
            Object.assign(r, { state: 'CONFIRMED', result_data: JSON.parse(result), error_code: null });
            return { rows: [] };
        }
        if (text.includes('set state=$2')) {
            const [id, state, code] = params; const r = this.records.get(id);
            Object.assign(r, { state, error_code: code });
            return { rows: [] };
        }
        throw Error(`Unhandled SQL in fake: ${text}`);
    }
}

test('test-company configuration must be distinct and explicitly authorized', async () => {
    let calls = 0;
    const fake = async () => { calls++; return Response.json({ ok: true }); };
    for (const override of [
        { CDI_TEST_EMPRESA: 'BD000001' }, { CDI_TEST_WRITES_ENABLED: 'false' },
        { CDI_TEST_ENVIRONMENT_CONFIRMED: '' }, { CDI_TEST_API_KEY: '' },
    ]) {
        const client = createCdiTestClient({ env: { ...liveTestEnv(), ...override }, fetchImpl: fake });
        assert.equal(client.status().enabled, false);
        await assert.rejects(() => client.invoke('CDIGEST.CDI.pedidos.pendientes', {}), { code: 'CDI_TEST_DISABLED' });
    }
    assert.equal(calls, 0);
});

test('write function allowlist prevents arbitrary ERP writes', async () => {
    const client = createCdiTestClient({ env: liveTestEnv(), fetchImpl: async () => { throw Error('Should not call'); } });
    await assert.rejects(() => client.invoke('CDIGEST.CDI.documentos.guardar', {}), { code: 'CDI_TEST_FUNCTION_FORBIDDEN' });
    await assert.rejects(() => client.invoke('CDIGEST.CDI.pedidos.servir', {}), { code: 'CDI_TEST_IDEMPOTENCY_REQUIRED' });
});

test('test API sends Bearer exclusively on server and same idempotency key for write', async () => {
    const requests = [];
    const client = createCdiTestClient({ env: liveTestEnv(), fetchImpl: async (url, options) => {
        requests.push({ url, options }); return Response.json({ ok: true, documento: { clave: '00002' } });
    }});
    await client.invoke('CDIGEST.CDI.pedidos.servir', { tipo: 'PC', lineas: [] }, `SGA-TEST-${randomUUID()}`);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://cdicloud.es/apis/v2/ejecutar.php');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer not-a-real-key');
    const payload = JSON.parse(requests[0].options.body);
    assert.equal(payload.empresa, 'BD000099');
    assert.equal(payload.funcion, 'CDIGEST.CDI.pedidos.servir');
    assert.match(payload.idempotency_key, /^SGA-TEST-/);
});

test('preserves decimal precision and rejects excessive quantities', () => {
    assert.equal(decimalToUnits('0.000001'), 1n);
    assert.equal(decimalToUnits('5.123456'), 5123456n);
    assert.throws(() => decimalToUnits('0.0000001'));
    assert.throws(() => buildTestWrite({ ...form(), cantidad: '6.250001' }, pending()), /supera/i);
    assert.throws(() => buildTestWrite(form(), { ok: true, token: 'VERSION', lineas: [] }), /no está pendiente/i);
    assert.throws(() => buildTestWrite(form(), { ok: true, lineas: [{ idlinea: 'L-1', cantidad_pendiente: '4' }] }), /token/i);
});

test('preparation is persisted BEFORE write; commit verifies pending and duplicate commit is rejected', async () => {
    const db = new FakePool();
    const calls = [];
    const client = {
        status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn, data, key) => {
            calls.push({ fn, data, key });
            if (fn.endsWith('.pendientes')) return pending(calls.filter(c => c.fn.endsWith('.servir')).length ? '4.00' : '6.25');
            if (fn.endsWith('.servir')) {
                assert.equal(db.records.size, 1);
                const row = [...db.records.values()][0];
                assert.equal(row.state, 'SENDING');
                assert.equal(row.idempotency_key, key);
                return { ok: true, albaran: { tipo: 'AP', serie: 'A', clave: '00021' } };
            }
            throw Error('unexpected function');
        }
    };
    const service = createSgaCdiTestOperations({ pool: db, client });
    const draft = await service.prepare(form(), 'user1');
    assert.equal(draft.state, 'PREPARED');
    assert.equal(calls.length, 1);
    const result = await service.commit(draft.id, 'user1', 'CONFIRMAR_ESCRITURA_DE_PRUEBA');
    assert.equal(result.state, 'VERIFIED_PENDING');
    assert.equal(result.verification.pendingMatches, true);
    assert.equal(result.verification.actual, '4');
    assert.equal(calls.filter(c => c.fn.endsWith('.servir')).length, 1);
    await assert.rejects(() => service.commit(draft.id, 'user1', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { code: 'CDI_TEST_ALREADY_SENT' });
    await assert.rejects(() => service.read(draft.id, 'user2'), { code: 'CDI_TEST_NOT_FOUND' });
});

test('uncertain write can only be retried with the persisted payload and key', async () => {
    const db = new FakePool(); let failOnce = true;
    const writes = [];
    const client = {
        status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn, data, key) => {
            if (fn.endsWith('.pendientes')) return pending(writes.length > 1 ? '4' : '6.25');
            writes.push({ data, key });
            if (failOnce) { failOnce = false; throw new CdiTestError(504, 'CDI_TEST_TRANSPORT_UNCERTAIN', 'uncertain', { uncertain: true }); }
            return { ok: true, albaran: { tipo: 'AP' } };
        }
    };
    const service = createSgaCdiTestOperations({ pool: db, client });
    const draft = await service.prepare(form(), 'u');
    await assert.rejects(() => service.commit(draft.id, 'u', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { uncertain: true });
    assert.equal((await service.read(draft.id, 'u')).state, 'UNCERTAIN');
    const result = await service.retry(draft.id, 'u', 'REINTENTAR_MISMA_OPERACION');
    assert.equal(result.state, 'VERIFIED_PENDING');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
});

test('stock snapshot is read strictly from test company without ERP write', async () => {
    const queries = [];
    const client = { status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn, data) => { queries.push({ fn, data }); return { ok: true, existencias: [{ nserie: 'L001', existencias: '10.0000000000' }] }; } };
    const service = createSgaCdiTestOperations({ pool: new FakePool(), client });
    const result = await service.inspectStock({ codarticulo: 'ART1', codalmacen: '01', nserie: 'L001' });
    assert.equal(result.existencias[0].nserie, 'L001');
    assert.equal(queries[0].fn, 'CDIGEST.CDI.existencias.listar');
    assert.deepEqual(queries[0].data, { codarticulo: 'ART1', codalmacen: '01', nserie: 'L001', limite: 50, solo_con_saldo: false });
});

test('test-company readback loads the official albaran and preserves its identity', async () => {
    const db = new FakePool();
    const calls = [];
    const client = {
        status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn, data) => {
            calls.push({ fn, data });
            if (fn.endsWith('.pendientes')) return pending(calls.some(c => c.fn.endsWith('.servir')) ? '4' : '6.25');
            if (fn.endsWith('.servir')) return { ok: true, albaran: { tipo: 'AP', anio: '2026', serie: 'A', clave: '00021' } };
            if (fn.endsWith('.documentos.obtener')) return { ok: true, tipo: 'AP', lineas: [{ cantidad: '2.25', nserie: 'LT-01' }] };
            throw Error('unexpected function');
        }
    };
    const service = createSgaCdiTestOperations({ pool: db, client });
    const inspect = await service.inspect({ tipo: 'PP', anio: '2026', serie: 'A', clave: '00001' });
    assert.equal(inspect.lineas[0].idlinea, 'L-1');
    const draft = await service.prepare(form(), 'u');
    await service.commit(draft.id, 'u', 'CONFIRMAR_ESCRITURA_DE_PRUEBA');
    const record = await service.checkDocument(draft.id, 'u', { anio: '2026', serie: 'A', clave: '00021' });
    assert.equal(record.documentIdentity.tipo, 'AP');
    assert.equal(record.document.lineas[0].nserie, 'LT-01');
    assert.equal(calls.at(-1).fn, 'CDIGEST.CDI.documentos.obtener');
});

test('production company change after draft prevents dispatch', async () => {
    const db = new FakePool(); let company = 'BD000099';
    const client = { status: () => ({ enabled: true, testCompany: company }),
        invoke: async () => pending() };
    const service = createSgaCdiTestOperations({ pool: db, client });
    const draft = await service.prepare(form(), 'u');
    company = 'BD000098';
    await assert.rejects(() => service.commit(draft.id, 'u', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { code: 'CDI_TEST_ALREADY_SENT' });
});

test('reconciliation reports mismatch rather than claiming ERP success', () => {
    assert.deepEqual(verifyTestPending({ idlinea: 'L-1', expected_after: '4' }, pending('4.1')),
        { pendingMatches: false, expected: '4', actual: '4.1' });
});
