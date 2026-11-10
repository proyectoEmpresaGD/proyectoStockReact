/** Fase 10: las lecturas incompletas no pueden producir albaranes ni falsas confirmaciones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCompleteSalesPending, buildSalesPicking, verifySalesPending } from '../../server/services/sgaCdiSalesWorkflow.js';
import { createSgaCdiTestOperations, buildTestWrite, verifyTestPending } from '../../server/services/sgaCdiTestOperations.js';
import { cdiPendingLines } from '../../src/sga/sgaCdiPickingModel.js';

const identity = { tipo: 'PC', anio: '2026', serie: 'A', clave: '00000121' };
const good = () => ({ ok: true, token: 'VERSION-1', lineas: [
    { idlinea: '1', codarticulo: 'ARE00011', cantidad_pendiente: '6.5' },
] });
const preparing = { ...identity, fecha: '2026-11-09', serie_destino: 'A', codalmacen: '01',
    lineas: [{ idlinea: '1', cantidad: '2.5', nserie: 'PIEZA-01', ubicacion: 'A1' }] };
const legacy = { ...identity, fecha: '2026-11-09', serie_destino: 'A', codalmacen: '01',
    idlinea: '1', cantidad: '2.5', nserie: 'PIEZA-01', ubicacion: 'A1' };

const incomplete = [
    [{ ...good(), cursor_siguiente: 'NEXT_PAGE' }, 'CDI_FLOW_PENDING_PAGINATED'],
    [{ ...good(), cursor: 'NEXT_PAGE' }, 'CDI_FLOW_PENDING_PAGINATED'],
    [{ ...good(), hay_mas: true }, 'CDI_FLOW_PENDING_PAGINATED'],
    [{ ...good(), ok: false }, 'CDI_FLOW_PENDING_NOT_CONFIRMED'],
    [{ ...good(), token: '' }, 'CDI_FLOW_TOKEN_UNKNOWN'],
    [{ ...good(), lineas: [good().lineas[0], good().lineas[0]] }, 'CDI_FLOW_DUPLICATE_PENDING_ID'],
    [{ ...good(), lineas: [{ idlinea: '1', cantidad_pendiente: '6,5' }] }, 'CDI_FLOW_INVALID_QUANTITY'],
];

test('el preflight acepta solo líneas y token completos', () => {
    assert.equal(assertCompleteSalesPending(good()).length, 1);
    assert.equal(buildSalesPicking(preparing, good()).write.lineas.length, 1);
    assert.equal(buildTestWrite(legacy, good()).write.lineas.length, 1);
    assert.equal(cdiPendingLines(good()).length, 1);
});

test('lecturas paginadas, sin OK, sin token, duplicadas o con cantidad inválida: cero preparación', () => {
    for (const [response, code] of incomplete) {
        assert.throws(() => assertCompleteSalesPending(response), (error) => error.code === code, code);
        assert.throws(() => buildSalesPicking(preparing, response), (error) => error.code === code, `preparador: ${code}`);
        assert.throws(() => buildTestWrite(legacy, response), (error) => error.code === code, `laboratorio: ${code}`);
        assert.throws(() => cdiPendingLines(response), Error, `frontend: ${code}`);
    }
});

test('servicio de ensayo no escribe ni registra un albarán con pendientes incompletos', async () => {
    for (const [response, code] of incomplete) {
        let serveCalls = 0;
        let dbCalls = 0;
        const client = { status: () => ({ enabled: true, testCompany: 'BD000099', pilot: false }),
            invoke: async (fn) => {
                if (fn.endsWith('pedidos.servir')) { serveCalls++; throw Error('No debería servir'); }
                if (fn.endsWith('pedidos.pendientes')) return response;
                if (fn.endsWith('documentos.obtener')) return { ok: true, cabecera: identity };
                throw Error(`Función inesperada: ${fn}`);
            } };
        const pool = { query: async () => { dbCalls++; return { rows: [] }; } };
        const operations = createSgaCdiTestOperations({ pool, client });
        await assert.rejects(() => operations.inspectSalesOrder(identity), (error) => error.code === code);
        await assert.rejects(() => operations.preparePicking(preparing, 'operario'), (error) => error.code === code);
        assert.equal(serveCalls, 0, `No servir ${code}`);
        assert.equal(dbCalls, 0, `No almacenar preparación ${code}`);
    }
});

test('una lista posterior con hay_mas no verifica ni el pendiente ni el cierre del AC', () => {
    const before = buildSalesPicking(preparing, good()).before;
    const after = { ok: true, token: 'VERSION-2', lineas: [], hay_mas: true };
    assert.equal(verifySalesPending(before, after).pendingMatches, false);
    assert.equal(verifyTestPending({ idlinea: '1', expected_after: '0' }, after).pendingMatches, false);
});

test('la recuperación de envío incierto queda señalada y la petición de escritura usa writeRisk', () => {
    const gateway = readFileSync(new URL('../../src/sga/sgaCdiTestGateway.js', import.meta.url), 'utf8');
    const picking = readFileSync(new URL('../../src/sga/SgaCdiOrderPicking.jsx', import.meta.url), 'utf8');
    assert.match(gateway, /writeRisk: true.*CONFIRMAR_ESCRITURA_DE_PRUEBA/);
    assert.match(gateway, /writeRisk: true.*REINTENTAR_MISMA_OPERACION/);
    assert.match(picking, /resultUncertain && <p role="alert"/);
    assert.match(picking, /draft\.state === 'PREPARED' && !resultUncertain/);
});

test('operaciones anteriores se consultan por empresa, nunca mezclando TEST y piloto', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const record = { id, operator_id: 'operario', company: 'BD000098', state: 'PREPARED',
        before_data: { identity }, write_data: {}, created_at: '2026-11-09T08:00:00Z' };
    let recentParameters;
    const pool = { query: async (sql, params) => {
        if (String(sql).includes('SELECT * FROM sga_cdi_test_operations')) return { rows: [record] };
        if (String(sql).includes('SELECT id, state, company, created_at')) {
            recentParameters = params;
            return { rows: [] };
        }
        return { rows: [] };
    } };
    const client = { status: () => ({ enabled: true, testCompany: 'BD000099', pilot: false }) };
    const operations = createSgaCdiTestOperations({ pool, client });
    assert.equal((await operations.recent('operario')).operations.length, 0);
    assert.deepEqual(recentParameters, ['operario', 'BD000099']);
    await assert.rejects(() => operations.read(id, 'operario'), { code: 'CDI_TEST_COMPANY_CHANGED' });
});

test('un bloqueo de operación pendiente abre la recuperación en la pantalla habitual', () => {
    const picking = readFileSync(new URL('../../src/sga/SgaCdiOrderPicking.jsx', import.meta.url), 'utf8');
    assert.match(picking, /CDI_TEST_UNFINISHED_ORDER.*CDI_PILOT_ALREADY_USED/);
    assert.match(picking, /setRecoverySuggested\(true\)/);
    assert.match(picking, /sgaCdiTestGateway\.recent\(token\)/);
});
