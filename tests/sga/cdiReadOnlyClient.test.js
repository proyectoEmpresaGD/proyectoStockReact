import test from 'node:test';
import assert from 'node:assert/strict';
import { createCdiReadOnlyClient, CdiReadError } from '../../server/services/cdiReadOnlyClient.js';

const env = { CDI_READ_ENABLED: 'true', CDI_API_KEY: 'SECRETO_SOLO_PRUEBAS', CDI_EMPRESA: 'BD000001' };
const reply = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('El conector está desactivado de forma segura si no se habilita', async () => {
    let called = false;
    const client = createCdiReadOnlyClient({ env: {}, fetchImpl: async () => { called = true; } });
    assert.deepEqual(client.status(), { enabled: false, configured: false, mode: 'READ_ONLY', company: null, writesEnabled: false });
    await assert.rejects(client.read('catalog'), (e) => e.code === 'CDI_NOT_CONFIGURED' && e.status === 503);
    assert.equal(called, false);
});

test('Sin empresa autorizada y clave nunca se realiza ninguna llamada', async () => {
    let called = false;
    const client = createCdiReadOnlyClient({ env: { CDI_READ_ENABLED: 'true', CDI_API_KEY: 'test', CDI_EMPRESA: 'BD00000X' }, fetchImpl: async () => { called = true; } });
    assert.equal(client.status().configured, false);
    await assert.rejects(client.read('masters', { entidad: 'ARTICULO' }), CdiReadError);
    assert.equal(called, false);
});

test('api.catalogo no incluye empresa ni datos y nunca expone la clave al resultado', async () => {
    const observed = [];
    const client = createCdiReadOnlyClient({ env, fetchImpl: async (url, options) => {
        observed.push({ url, options });
        return reply({ ok: true, funciones: ['CDIGEST.CDI.maestros.listar'] });
    }});
    const result = await client.read('catalog');
    assert.equal(result.ok, true);
    const { url, options } = observed[0];
    assert.equal(url, 'https://cdicloud.es/apis/v2/ejecutar.php');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer SECRETO_SOLO_PRUEBAS');
    assert.deepEqual(JSON.parse(options.body), { funcion: 'api.catalogo' });
    assert.doesNotMatch(JSON.stringify(result), /SECRETO_SOLO_PRUEBAS/);
});

test('Lecturas de stock conservan códigos y filtros sin transformar unidades', async () => {
    const observed = [];
    const client = createCdiReadOnlyClient({ env, fetchImpl: async (_url, options) => {
        observed.push(JSON.parse(options.body));
        return reply({ ok: true, existencias: [{ codarticulo: '00001', nserie: '00000002', existencias: '12.3000000000' }] });
    }});
    const result = await client.read('stock', { codarticulo: '00001', nserie: '00000002', limite: 25, despues: 'v2|0001|x' });
    assert.equal(result.existencias[0].existencias, '12.3000000000');
    assert.deepEqual(observed[0], {
        funcion: 'CDIGEST.CDI.existencias.listar', empresa: 'BD000001',
        datos: { codarticulo: '00001', nserie: '00000002', limite: 25, despues: 'v2|0001|x' },
    });
});

test('Se deniegan todos los nombres de operación que no sean las seis lecturas', async () => {
    let called = 0;
    const client = createCdiReadOnlyClient({ env, fetchImpl: async () => { called++; } });
    for (const kind of ['servir', 'guardar', 'stock.operaciones.guardar', 'CDIGEST.CDI.pedidos.servir', '__proto__', 'constructor']) {
        await assert.rejects(client.read(kind, {}), (e) => e.code === 'CDI_READ_NOT_ALLOWED' && e.status === 400);
    }
    assert.equal(called, 0);
});

test('HTTP 401 del ERP se diferencia de la sesión Stock+ y no revela secretos', async () => {
    const client = createCdiReadOnlyClient({ env, fetchImpl: async () => reply({ ok: false, codigo: 'INTEGRACION_API_NO_VIGENTE', mensaje: 'secreto SECRETO_SOLO_PRUEBAS' }, 401) });
    await assert.rejects(client.read('catalog'), (e) => {
        assert.equal(e.status, 502);
        assert.equal(e.code, 'INTEGRACION_API_NO_VIGENTE');
        assert.doesNotMatch(e.message, /SECRETO_SOLO_PRUEBAS/);
        return true;
    });
});

test('429 pide esperar y conserva Retry-After para la API del backend', async () => {
    const client = createCdiReadOnlyClient({ env, fetchImpl: async () => reply({ ok: false, codigo: 'CUOTA_SUPERADA' }, 429, { 'Retry-After': '60' }) });
    await assert.rejects(client.read('masters', { entidad: 'ARTICULO' }), (e) => e.status === 503 && e.retryAfter === '60');
});

test('Aunque CDI responda 200, ok false sigue siendo error', async () => {
    const client = createCdiReadOnlyClient({ env, fetchImpl: async () => reply({ ok: false, codigo: 'NO_AUTORIZADA' }) });
    await assert.rejects(client.read('pending', { tipo: 'PC' }), (e) => e.status === 502 && e.code === 'NO_AUTORIZADA');
});

test('Una respuesta desmesurada no alcanza al frontend', async () => {
    const client = createCdiReadOnlyClient({ env, fetchImpl: async () => new Response('{"ok":true,"texto":"' + 'a'.repeat(2 * 1024 * 1024) + '"}') });
    await assert.rejects(client.read('masters', { entidad: 'ARTICULO' }), (e) => e.status === 502 && e.code === 'CDI_RESPONSE_TOO_LARGE');
});

test('Errores de transporte y timeout no se interpretan como sesión caducada', async () => {
    const transport = createCdiReadOnlyClient({ env, fetchImpl: async () => { throw new Error('ERROR RED SECRETO_SOLO_PRUEBAS'); } });
    await assert.rejects(transport.read('catalog'), (e) => e.status === 503 && !e.message.includes('SECRETO_SOLO_PRUEBAS'));
    const timeout = createCdiReadOnlyClient({ env, fetchImpl: async () => { const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; } });
    await assert.rejects(timeout.read('catalog'), (e) => e.status === 504 && e.code === 'CDI_TIMEOUT');
});
