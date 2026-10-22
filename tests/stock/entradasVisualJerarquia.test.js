import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupConfirmedReceipts } from '../../src/features/entradas/entradasUtils.js';
import { normalizeCurrentLots, receivedUnit, receiptLineDetails, summarizeCurrentLots } from '../../src/features/entradas/lotDetailsUtils.js';

const src = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('cantidad recibida suma solo líneas de compra distintas y no se confunde con stock', () => {
    const entries = groupConfirmedReceipts([
        { codprodu: 'ARE001', productType: '101', desprodu: 'Lino', cantidad: 32.5, receiptLineId: 'a:1', serieAlbaran: 'A', numeroAlbaran: '10' },
        { codprodu: 'ARE001', productType: '101', cantidad: 15, receiptLineId: 'a:2', serieAlbaran: 'A', numeroAlbaran: '11' },
        { codprodu: 'ARE001', productType: '101', cantidad: 32.5, receiptLineId: 'a:1', serieAlbaran: 'A', numeroAlbaran: '10' },
    ]);
    assert.equal(entries[0].quantity, 47.5);
    assert.equal(entries[0].productType, '101');
    assert.equal(receiptLineDetails(entries[0]).length, 2);
    assert.equal(receivedUnit(entries[0]), 'm');
});

test('libros o muestrarios no se presentan como metros sin unidad verificada', () => {
    assert.equal(receivedUnit({ productType: '103' }), '');
    assert.equal(receivedUnit({ productType: null }), '');
});

test('stock total es suma de stock físico ACTUAL en los lotes consultados', () => {
    const lots = normalizeCurrentLots([
        { codprodu: 'ARE001', codlote: 'L1', stocktotal: 50, stockreservado: 12, stockactual: 38 },
        { codprodu: 'ARE001', codlote: 'L2', stocktotal: 20, stockreservado: 5, stockactual: 15 },
        { codprodu: 'ARE001-A', codlote: 'OTRO', stocktotal: 999, stockreservado: 0, stockactual: 999 },
    ], 'ARE001');
    assert.deepEqual(summarizeCurrentLots(lots), { total: 70, reserved: 17, available: 53 });
});

test('interfaz muestra cantidad y stock inmediatamente; lotes visibles en un solo clic y sin falsos recibidos', () => {
    const detail = src('src/features/entradas/EntryLotDetails.jsx');
    assert.match(detail, /Metros en albarán/);
    assert.match(detail, /Stock total actual del producto/);
    assert.match(detail, /Lotes del producto/);
    assert.doesNotMatch(detail, /showCurrentLots/);
    assert.match(detail, /Desglose del stock total actual/);
    assert.doesNotMatch(detail, /getVerifiedReceiptLots|Recibido en esta entrada/);
    assert.match(detail, /api\/stock\/entradas\/lotes/);
    const page = src('src/pages/EntradasPages.jsx');
    assert.match(page, /Metros en albarán/);
    assert.match(page, /Stock total actual/);
    assert.match(page, /api\/stock\/entradas\/stock-totales/);
    assert.match(page, /EntryLotDetails/);
    const query = src('server/services/recepcionesCompra.js');
    assert.match(query, /p\.codtipo::text\) AS "productType"/);
    const routes = src('server/routes/stock.js');
    assert.match(routes, /requireRouteAccess\('\/entradas', 'ventas', 'administracion'\)/);
});
