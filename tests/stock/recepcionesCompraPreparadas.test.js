import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getReceptionConfig, buildReceptionQuery, validDate, todayMadrid, getRecepcionesCompraByDate, RecepcionesNoConfiguradasError } from '../../server/services/recepcionesCompra.js';
import { groupConfirmedReceipts, collectReceiptIds, detectNewReceipts, updateStoredActivity, madridISODate, sortStockActivity } from '../../src/features/entradas/entradasUtils.js';

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('sin estados confirmados y fecha validada, el endpoint NO consulta compras', async () => {
    let queryCalls = 0;
    await assert.rejects(getRecepcionesCompraByDate('2026-10-21', {}, { query: () => { queryCalls++; } }), RecepcionesNoConfiguradasError);
    assert.equal(queryCalls, 0);
});

test('estados y nombres de campos solo pueden venir de listas blancas', () => {
    assert.throws(() => getReceptionConfig({ CJM_RECEPCION_FECHA: 'fecha;DROP', CJM_RECEPCION_ESTADOS: 'R' }), RecepcionesNoConfiguradasError);
    assert.throws(() => getReceptionConfig({ CJM_RECEPCION_FECHA: 'fecha', CJM_RECEPCION_ESTADOS: "R');DROP" }), RecepcionesNoConfiguradasError);
    const config = getReceptionConfig({ CJM_RECEPCION_FECHA: 'fecha', CJM_RECEPCION_HORA: 'hora', CJM_RECEPCION_ESTADOS: 'R,F,R', CJM_RECEPCION_EXIGIR_ID: 'true' });
    assert.deepEqual(config.states, ['R', 'F']);
    assert.match(buildReceptionQuery(config), /a\.idrecepcion IS NOT NULL/);
});

test('fecha de España evita el día UTC del servidor y valida fechas imposible', () => {
    assert.equal(todayMadrid(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
    assert.equal(madridISODate(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
    assert.equal(validDate('2026-02-30'), false);
    assert.equal(validDate('2026-10-21'), true);
});

test('JOIN compuesto por ejercicio, canal, serie y número; sin fecha de modificación de stock', () => {
    const sql = buildReceptionQuery(getReceptionConfig({ CJM_RECEPCION_FECHA: 'fecha', CJM_RECEPCION_HORA: 'horaentre', CJM_RECEPCION_ESTADOS: 'R' }));
    assert.match(sql, /FROM albcompra a/);
    assert.match(sql, /JOIN albcompra_linea l/);
    assert.match(sql, /l\.ejercicio = a\.ejercicio AND l\.canal = a\.canal/);
    assert.match(sql, /a\.fecha >= \$1::date/);
    assert.match(sql, /a\.fecha < \(\$1::date \+ INTERVAL '1 day'\)/);
    assert.match(sql, /l\.cantidad > 0/);
    assert.doesNotMatch(sql, /fecultmod|cancompra/);
});

test('agrupa líneas sin duplicarlas y ordena por hora real configurada', () => {
    const grouped = groupConfirmedReceipts([
        { codprodu: 'ARE001', desprodu: 'Lino', cantidad: 15, receiptLineId: '1', receivedAt: '2026-10-21T09:00:00Z' },
        { codprodu: 'ARE001', desprodu: 'Lino', cantidad: 15, receiptLineId: '1', receivedAt: '2026-10-21T09:00:00Z' },
        { codprodu: 'ARE001', desprodu: 'Lino', cantidad: 20, receiptLineId: '2', receivedAt: '2026-10-21T10:00:00Z' },
        { codprodu: 'HAR001', desprodu: 'Seda', cantidad: 5, receiptLineId: '3', receivedAt: '2026-10-21T08:00:00Z' },
    ]);
    assert.equal(grouped.find(item => item.codprodu === 'ARE001').quantity, 35);
    assert.equal(grouped.find(item => item.codprodu === 'ARE001').recordCount, 2);
    assert.deepEqual(sortStockActivity(grouped, 'oldest').map(item => item.codprodu), ['HAR001', 'ARE001']);
});

test('última entrada y primera entrada usan extremos distintos cuando hay varias líneas', () => {
    const grouped = groupConfirmedReceipts([
        { codprodu: 'A', cantidad: 1, receiptLineId: 'a-1', receivedAt: '2026-10-21T07:00:00Z' },
        { codprodu: 'A', cantidad: 1, receiptLineId: 'a-2', receivedAt: '2026-10-21T17:00:00Z' },
        { codprodu: 'B', cantidad: 1, receiptLineId: 'b-1', receivedAt: '2026-10-21T11:00:00Z' },
    ]);
    assert.deepEqual(sortStockActivity(grouped, 'recent').map(x => x.codprodu), ['A', 'B']);
    assert.deepEqual(sortStockActivity(grouped, 'oldest').map(x => x.codprodu), ['A', 'B']);
});

test('no avisa históricos ni dobles lecturas; avisa por ID de línea NUEVO', () => {
    const date = '2026-10-21';
    const first = groupConfirmedReceipts([{ codprodu: 'ARE1', cantidad: 2, receiptLineId: 'alb:1' }]);
    const initial = updateStoredActivity(null, first, date);
    assert.deepEqual(initial.notifications, []);
    assert.deepEqual(collectReceiptIds(first), ['ARE1|alb:1']);
    const second = groupConfirmedReceipts([
        { codprodu: 'ARE1', cantidad: 2, receiptLineId: 'alb:1' },
        { codprodu: 'ARE1', cantidad: 2, receiptLineId: 'alb:2' },
    ]);
    assert.deepEqual(detectNewReceipts(initial.receiptIds, second, date).map(note => note.change), [2]);
    const updated = updateStoredActivity(initial, second, date);
    assert.equal(updated.notifications.length, 1);
    assert.equal(updateStoredActivity(updated, second, date).notifications.length, 1);
});

test('si hoy empieza sin albaranes, el primer albarán posterior sí notifica', () => {
    const date = '2026-10-21';
    const firstPoll = updateStoredActivity(null, [], date, true);
    assert.deepEqual(firstPoll.receiptIds, []);
    const newArrival = groupConfirmedReceipts([{ codprodu: 'ARE001', cantidad: 4, receiptLineId: 'R1' }]);
    const next = updateStoredActivity(firstPoll, newArrival, date, true);
    assert.equal(next.notifications.length, 1);
    assert.equal(next.notifications[0].change, 4);
});

test('ruta nueva protegida, consulta anterior y sus permisos no se modifican', () => {
    const route = file('server/routes/stock.js');
    assert.match(route, /'\/entradas\/recepciones', requireRouteAccess\('\/entradas', 'ventas', 'administracion'\)/);
    assert.match(route, /stockRouter\.get\('\/entradas', stockController\.getEntradas/);
    const page = file('src/pages/EntradasPages.jsx');
    assert.match(page, /VITE_CJM_ENTRADAS_REALES/);
    assert.match(page, /stock\?buscar=/);
});

// Confirmación del ERP de CJM: solo albcompra.fecha determina qué entra en Hoy/Ayer.
test('el filtro de Entradas usa siempre albcompra.fecha y rechaza fecentre', async () => {
    const defaultConfig = getReceptionConfig({ CJM_RECEPCION_ESTADOS: 'C' });
    assert.equal(defaultConfig.date, 'fecha');
    assert.throws(
        () => getReceptionConfig({ CJM_RECEPCION_FECHA: 'fecentre', CJM_RECEPCION_ESTADOS: 'C' }),
        RecepcionesNoConfiguradasError,
    );
    const sql = buildReceptionQuery(defaultConfig);
    assert.match(sql, /a\.fecha >= \$1::date/);
    assert.match(sql, /a\.fecha < \(\$1::date \+ INTERVAL '1 day'\)/);
    assert.doesNotMatch(sql, /a\.fecentre|fecultmod|cancompra/);
    const calls = [];
    const db = { query: async (query, params) => { calls.push({ query, params }); return { rows: [] }; } };
    await getRecepcionesCompraByDate('2026-10-21', { CJM_RECEPCION_ESTADOS: 'C' }, db);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ['2026-10-21', ['C']]);
});
