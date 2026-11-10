import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCdiTestClient } from '../../server/services/cdiTestClient.js';
import { buildSalesPicking, verifySalesPending, assessSalesHandoff } from '../../server/services/sgaCdiSalesWorkflow.js';
import { verifyTestPending } from '../../server/services/sgaCdiTestOperations.js';
import { mergeCdiOrderPages } from '../../src/sga/sgaCdiPickingModel.js';

const companyEnv = {
    CDI_EMPRESA: 'BD000001', CDI_TEST_EMPRESA: 'BD000099',
    CDI_TEST_API_KEY: 'fake-only-not-a-secret',
    CDI_TEST_WRITES_ENABLED: 'true', CDI_TEST_ENVIRONMENT_CONFIRMED: 'SI_ENTORNO_DE_PRUEBAS',
};
const order = { tipo: 'PC', anio: '2026', serie: 'A', clave: '000123' };
const before = () => buildSalesPicking({ ...order, fecha: '2026-11-06', serie_destino: 'A', codalmacen: '01', lineas: [
    { idlinea: '1', cantidad: '2', nserie: 'L-01', ubicacion: 'A1' },
] }, { ok: true, token: 'v1', lineas: [
    { idlinea: '1', codarticulo: 'TELA', cantidad_pendiente: '2' },
] }).before;

test('una página incompleta de pendientes nunca aprueba un albarán aunque la línea no aparezca', () => {
    const source = before();
    const page = { ok: true, token: 'v2', lineas: [], cursor_siguiente: 'PAGE-2' };
    const verification = verifySalesPending(source, page);
    assert.equal(verification.pendingMatches, false);
    assert.match(verification.note, /paginad/i);
    const handoff = assessSalesHandoff({
        before_data: source,
        result_data: { ok: true, albaran: { tipo: 'AC', anio: '2026', serie: 'A', clave: '000321' } },
        document_identity: { tipo: 'AC', anio: '2026', serie: 'A', clave: '000321' },
        document_data: { ok: true, tipo: 'AC', cabecera: { codalmacen: '01' }, lineas: [{ codarticulo: 'TELA', cantidad: '2', nserie: 'L-01', ubicacion: 'A1' }] },
        verification_data: verification,
        write_data: { codalmacen: '01' },
    });
    assert.equal(handoff.status, 'CHECK_PENDING');
});

test('pendientes ambiguos (duplicados, ok:false, sin datos originales) nunca pasan', () => {
    const source = before();
    assert.equal(verifySalesPending(source, { ok: false, lineas: [] }).pendingMatches, false);
    assert.equal(verifySalesPending({ lines: [] }, { ok: true, lineas: [] }).pendingMatches, false);
    const duplicate = { ok: true, lineas: [
        { idlinea: '1', codarticulo: 'TELA', cantidad_pendiente: '0' },
        { idlinea: '1', codarticulo: 'TELA', cantidad_pendiente: '0' },
    ] };
    assert.equal(verifySalesPending(source, duplicate).pendingMatches, false);
    assert.equal(verifySalesPending(source, { ok: true, lineas: [] }).pendingMatches, true);
});

test('el laboratorio antiguo tampoco considera un cursor/duplicado como línea completada', () => {
    const source = { idlinea: '1', expected_after: '0' };
    assert.equal(verifyTestPending(source, { ok: true, lineas: [], cursor_siguiente: 'NEXT' }).pendingMatches, false);
    assert.equal(verifyTestPending(source, { ok: false, lineas: [] }).pendingMatches, false);
    assert.equal(verifyTestPending(source, { ok: true, lineas: [
        { idlinea: '1', cantidad_pendiente: '0' }, { idlinea: '1', cantidad_pendiente: '0' },
    ] }).pendingMatches, false);
});

test('la lista de pedidos une páginas sin duplicar identidades ni perder ceros a la izquierda', () => {
    const row = (clave, name) => ({ identity: { ...order, clave }, doc: { cabecera: { tercero: name } } });
    const first = mergeCdiOrderPages([], [row('00001', 'A'), row('00002', 'B')], { reset: true });
    const second = mergeCdiOrderPages(first, [row('00002', 'B nuevo'), row('00003', 'C')]);
    assert.deepEqual(second.map(({ identity }) => identity.clave), ['00001', '00002', '00003']);
    assert.equal(second[1].doc.cabecera.tercero, 'B nuevo');
    assert.deepEqual(mergeCdiOrderPages(second, [row('00004', 'D')], { reset: true }).map(({ identity }) => identity.clave), ['00004']);
});

test('CDI 429 sin JSON conserva el límite y Retry-After para no repetir a ciegas', async () => {
    const client = createCdiTestClient({ env: companyEnv, fetchImpl: async () =>
        new Response('<html>Rate limit</html>', { status: 429, headers: { 'content-type': 'text/html', 'retry-after': '60' } }) });
    await assert.rejects(() => client.invoke('CDIGEST.CDI.pedidos.pendientes', order), (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.code, 'CDI_HTTP_429');
        assert.equal(error.retryAfter, '60');
        assert.equal(error.uncertain, false);
        return true;
    });
});

test('CDI 503 sin JSON queda incierto y CDI 403 sin JSON no invalida la sesión de Stock+', async () => {
    for (const status of [403, 503]) {
        const client = createCdiTestClient({ env: companyEnv, fetchImpl: async () =>
            new Response('upstream unavailable', { status }) });
        await assert.rejects(() => client.invoke('CDIGEST.CDI.pedidos.servir', {}, 'SGA-TEST-00000000-0000-4000-8000-000000000001'), (error) => {
            assert.equal(error.status, status);
            assert.equal(error.uncertain, status >= 500);
            return true;
        });
    }
});

test('la preparación bloquea ediciones de campos mientras existe una petición pendiente', () => {
    const source = readFileSync(new URL('../../src/sga/SgaCdiOrderPicking.jsx', import.meta.url), 'utf8');
    for (const field of ['pick.cantidad', 'pick.nserie', 'pick.ubicacion', 'docSettings.fecha', 'docSettings.serie_destino', 'docSettings.codalmacen']) {
        assert.match(source, new RegExp(`value=\\{${field.replace('.', '\\.')}\\} disabled=\\{busy\\}`));
    }
    assert.match(source, /function scanProductOrLot\(\) \{\s*if \(inFlight\.current \|\| pausedCheckpoint \|\| sealedCheckpoint\) return;/);
});
