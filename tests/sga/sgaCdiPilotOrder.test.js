import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCdiTestClient } from '../../server/services/cdiTestClient.js';
import { createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';

const pilotEnv = () => ({
    CDI_READ_ENABLED: 'true', CDI_EMPRESA: 'BD000001', CDI_API_KEY: 'private-fake-key',
    CDI_PILOT_WRITES_ENABLED: 'true', CDI_PILOT_EMPRESA: 'BD000001',
    CDI_PILOT_ORDER: 'PC|2026|A|00000123',
    CDI_PILOT_PRODUCTION_CONFIRMED: 'ACEPTO_ALBARAN_REAL_EN_PRODUCCION',
});
const permitted = { tipo: 'PC', anio: '2026', serie: 'A', clave: '00000123' };
const serve = 'CDIGEST.CDI.pedidos.servir';
const pending = 'CDIGEST.CDI.pedidos.pendientes';

test('piloto real requiere todas las confirmaciones privadas: desactivado significa cero llamadas', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return Response.json({ ok: true }); };
    for (const altered of [
        { CDI_PILOT_WRITES_ENABLED: 'false' },
        { CDI_PILOT_EMPRESA: 'BD000002' },
        { CDI_PILOT_ORDER: '' },
        { CDI_PILOT_ORDER: 'PP|2026|A|00000123' },
        { CDI_PILOT_PRODUCTION_CONFIRMED: 'NO' },
        { CDI_READ_ENABLED: 'false' },
        { CDI_API_KEY: '' },
        { CDI_TEST_WRITES_ENABLED: 'true', CDI_TEST_EMPRESA: 'BD000001' },
    ]) {
        const client = createCdiTestClient({ env: { ...pilotEnv(), ...altered }, fetchImpl });
        assert.equal(client.status().enabled, false);
        await assert.rejects(() => client.invoke(serve, permitted, `SGA-TEST-${randomUUID()}`), { code: 'CDI_TEST_DISABLED' });
    }
    assert.equal(calls, 0);
});

test('piloto permite escribir solo el PC autorizado y mantiene la clave Bearer en el servidor', async () => {
    const requests = [];
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async (url, options) => {
        requests.push({ url, options }); return Response.json({ ok: true, albaran: { tipo: 'AC', clave: '00000421' } });
    }});
    assert.deepEqual(client.status().allowedOrder, permitted);
    assert.equal(client.status().pilot, true);
    assert.equal(client.status().testCompany, 'BD000001');
    assert.equal(client.status().mode, 'PILOT_REAL_ORDER');
    for (const wrong of [
        { ...permitted, clave: '00000124' },
        { ...permitted, tipo: 'PP' },
        { ...permitted, anio: '2025' },
        { ...permitted, serie: 'B' },
        {},
    ]) {
        await assert.rejects(() => client.invoke(serve, { ...wrong, lineas: [] }, `SGA-TEST-${randomUUID()}`), { code: 'CDI_PILOT_ORDER_FORBIDDEN' });
    }
    assert.equal(requests.length, 0);
    await client.invoke(serve, { ...permitted, token: 'VER001', lineas: [{ idlinea: 'L1', cantidad: '1' }] }, `SGA-TEST-${randomUUID()}`);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer private-fake-key');
    assert.equal(JSON.parse(requests[0].options.body).empresa, 'BD000001');
});

test('preferencia TEST: una configuración TEST válida impide que el piloto tome el control', () => {
    const client = createCdiTestClient({ env: {
        ...pilotEnv(), CDI_TEST_EMPRESA: 'BD000099', CDI_TEST_API_KEY: 'test-secret',
        CDI_TEST_WRITES_ENABLED: 'true', CDI_TEST_ENVIRONMENT_CONFIRMED: 'SI_ENTORNO_DE_PRUEBAS',
    }});
    assert.equal(client.status().pilot, false);
    assert.equal(client.status().testCompany, 'BD000099');
});

test('laboratorio antiguo sin bloqueo no puede preparar ni enviar piloto', async () => {
    let calls = 0;
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async () => { calls++; return Response.json({ ok: true }); } });
    const operations = createSgaCdiTestOperations({ pool: {}, client });
    await assert.rejects(() => operations.prepare({ ...permitted }, 'u'), { code: 'CDI_PILOT_USE_PREPARADOR' });
    await assert.rejects(() => operations.preparePicking({ ...permitted }, 'u'), { code: 'CDI_PILOT_LEASE_REQUIRED' });
    await assert.rejects(() => operations.inspect({ ...permitted, clave: '00000124' }), { code: 'CDI_PILOT_ORDER_FORBIDDEN' });
    await assert.rejects(() => operations.inspectSalesOrder({ ...permitted, clave: '00000124' }), { code: 'CDI_PILOT_ORDER_FORBIDDEN' });
    assert.equal(calls, 0);
});

test('listado piloto devuelve únicamente el PC autorizado leyendo pendientes, sin exigir documentos.obtener', async () => {
    const calls = [];
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async (_, options) => {
        const { funcion, datos } = JSON.parse(options.body);
        calls.push({ funcion, datos });
        assert.equal(funcion, pending);
        assert.deepEqual(datos, permitted);
        return Response.json({ ok: true, token: 'TOK-1', lineas: [{
            idlinea: 'L1', codarticulo: 'ART0001', cantidad_pendiente: '1.5',
        }] });
    }});
    const operations = createSgaCdiTestOperations({ pool: {}, client });
    const list = await operations.listSalesOrders();
    assert.equal(list.documentos.length, 1);
    assert.deepEqual(Object.fromEntries(['tipo','anio','serie','clave'].map(k => [k, list.documentos[0].cabecera[k]])), permitted);
    assert.equal(list.documentos[0].cabecera.lineas_pendientes, 1);
    assert.equal(calls.length, 1);
    const next = await operations.listSalesOrders({ despues: 'XYZ' });
    assert.equal(next.documentos.length, 0);
    assert.equal(calls.length, 1);
    const detail = await operations.inspectSalesOrder(permitted);
    assert.equal(detail.document, null);
    assert.equal(detail.pending.lineas[0].idlinea, 'L1');
    assert.equal(calls.length, 2);
});

test('diagnóstico del piloto solo consulta pendientes del pedido autorizado', async () => {
    const calls = [];
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async (_, options) => {
        const payload = JSON.parse(options.body);
        calls.push(payload);
        return Response.json({ ok: true, token: 'TOK', lineas: [{ idlinea: 'L1', cantidad_pendiente: '1.25' }] });
    }});
    const pool = { query: async () => ({ rows: [] }) };
    const operations = createSgaCdiTestOperations({ pool, client });
    const report = await operations.readiness();
    assert.equal(report.ready, true);
    assert.equal(report.company, 'BD000001');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].funcion, pending);
    assert.deepEqual(calls[0].datos, permitted);
});

test('una confirmación incompleta no cambia el estado PREPARED ni envía pedidos.servir', async () => {
    const id = randomUUID();
    const record = { id, operator_id: 'u', company: 'BD000001', state: 'PREPARED',
        before_data: { identity: permitted, sgaLease: { key: 'CDI|BD000001|2026|PC|A|00000123', token: 'lease' } },
        write_data: { ...permitted, token: 'TOK', lineas: [{ idlinea: 'L1', cantidad: '1' }] } };
    let writes = 0;
    let transitions = 0;
    const pool = { query: async (sql) => {
        if (String(sql).includes('SELECT *')) return { rows: [record] };
        if (String(sql).includes('UPDATE')) transitions++;
        return { rows: [] };
    }};
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async () => { writes++; return Response.json({ ok: true }); } });
    const operations = createSgaCdiTestOperations({ pool, client, locks: { verify: async () => ({ ok: true }) } });
    for (const phrase of ['', 'CONFIRMAR', 'AC BD000001 PC 2026/A/OTRO']) {
        await assert.rejects(() => operations.commit(id, 'u', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', 'lease', phrase),
            { code: 'CDI_PILOT_CONFIRMATION_REQUIRED' });
    }
    assert.equal(writes, 0);
    assert.equal(transitions, 0);
});


test('404 de pedidos.pendientes en piloto identifica clave o permiso sin pedir documentos.obtener', async () => {
    const calls = [];
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async (_, options) => {
        const body = JSON.parse(options.body);
        calls.push(body.funcion);
        return Response.json({ ok: false, codigo: 'CDI_HTTP_404' }, { status: 404 });
    }});
    const operations = createSgaCdiTestOperations({ pool: {}, client });
    for (const action of [() => operations.listSalesOrders(), () => operations.inspectSalesOrder(permitted)]) {
        await assert.rejects(action(), (error) => {
            assert.equal(error.status, 422);
            assert.equal(error.code, 'CDI_PILOT_PENDING_NOT_ACCESSIBLE');
            assert.match(error.message, /clave puede ser distinta del número/);
            return true;
        });
    }
    assert.deepEqual(calls, [pending, pending]);
});

test('piloto rechaza pendientes incompletos antes de mostrar el PC, sin escrituras', async () => {
    const calls = [];
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async (_, options) => {
        calls.push(JSON.parse(options.body).funcion);
        return Response.json({ ok: true, token: 'TOK', lineas: [{ idlinea: 'L1', cantidad_pendiente: '3' }], cursor_siguiente: 'NEXT' });
    }});
    const operations = createSgaCdiTestOperations({ pool: {}, client });
    await assert.rejects(() => operations.listSalesOrders(), { code: 'CDI_FLOW_PENDING_PAGINATED' });
    assert.deepEqual(calls, [pending]);
});

test('un fallo de transporte CDI no se confunde con pedido piloto inexistente', async () => {
    const client = createCdiTestClient({ env: pilotEnv(), fetchImpl: async () => {
        throw new Error('offline');
    } });
    const operations = createSgaCdiTestOperations({ pool: {}, client });
    await assert.rejects(() => operations.listSalesOrders(), (error) => {
        assert.equal(error.code, 'CDI_TEST_TRANSPORT_UNCERTAIN');
        assert.equal(error.status, 504);
        return true;
    });
});
