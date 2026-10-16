import test from 'node:test';
import assert from 'node:assert/strict';
import { sgaGateway, sgaOrderGateway } from '../../src/sga/sgaGateway.js';
import {
    pendingLines, getLineProgress, getOrderProgress, lotAvailable, resolveScannedCode,
    preparePick, validateOrderReview, formatUnitTotals,
} from '../../src/sga/sgaPicking.js';
import { buildOrderDraft } from '../../src/sga/sgaOrderDocuments.js';

const products = await sgaGateway.listProducts();
const orders = await sgaOrderGateway.listOrders();
const order = orders[0];
const line = pendingLines(order)[0];
const product = products.find((item) => item.code === line.productCode);
const lot = product.lots[0];
const pick = (delivered, waste, picks = [], chosenLot = lot) => preparePick({ order, line, product, lot: chosenLot, delivered, waste, picks });

test('buscador de pedidos devuelve propuestas por cliente y número', async () => {
    assert.equal((await sgaOrderGateway.listOrders('24018')).length, 1);
    assert.equal((await sgaOrderGateway.listOrders('Estudio')).length, 1);
});
test('solo líneas linservi P entran en la preparación', () => {
    assert.equal(pendingLines(order).length, 2);
    assert.equal(pendingLines(order).some((item) => item.linservi === 'S'), false);
});
test('QR de etiqueta stock contiene producto o lote en texto plano', () => {
    assert.equal(resolveScannedCode(' demo-tela-01 ', line, products).kind, 'product');
    assert.equal(resolveScannedCode('DEMO-L-100', line, products).kind, 'lot');
});
test('QR lote de otro producto es rechazado', () => {
    const result = resolveScannedCode('DEMO-L-250', line, products);
    assert.equal(result.ok, false);
});
test('4,50 m cliente y 0,20 m merma descuentan 4,70 m', () => {
    const result = pick('4,50', '0,20');
    assert.equal(result.ok, true);
    assert.equal(result.pick.delivered, 4.5);
    assert.equal(result.pick.waste, .2);
    assert.equal(result.pick.stockDeduction, 4.7);
});
test('no se puede cortar más de la línea pedida', () => {
    const result = pick('9,51', '0');
    assert.equal(result.ok, false);
});
test('merma + entrega no pueden superar disponibilidad de lote', () => {
    const result = pick('9', '13');
    assert.equal(result.ok, false);
});
test('varios lotes pueden completar la misma línea sin duplicar el stock', () => {
    const first = pick('8', '0,20');
    assert.equal(first.ok, true);
    const remainder = getLineProgress(order, line, [first.pick]).remaining;
    assert.equal(remainder, 1.5);
    const second = pick('1,50', '0', [first.pick], product.lots[1]);
    assert.equal(second.ok, true);
    assert.equal(getLineProgress(order, line, [first.pick, second.pick]).finished, true);
});
test('la disponibilidad descuenta también otros cortes en memoria', () => {
    const first = pick('8', '0,20');
    assert.equal(lotAvailable(product, lot, [first.pick]), 12.6);
});
test('pedido parcial obliga confirmar líneas pendientes', () => {
    const first = pick('3', '0');
    assert.equal(validateOrderReview(order, [first.pick], products, []).ok, false);
    assert.equal(validateOrderReview(order, [first.pick], products, ['101', '102']).ok, true);
});
test('cuando disponibilidad de una línea está a cero se considera desabastecida', () => {
    const adjustedProducts = products.map((item) => item.code === 'DEMO-TELA-02'
        ? { ...item, lots: item.lots.map((lt) => ({ ...lt, physical: '0', reserved: '0' })) } : item);
    const progress = getOrderProgress(order, [], adjustedProducts);
    assert.equal(progress.zeroStock.length, 1);
    assert.equal(progress.zeroStock[0].id, '102');
    assert.equal(validateOrderReview(order, [], adjustedProducts, ['101']).ok, false);
    assert.equal(validateOrderReview(order, [], adjustedProducts, ['101', '102']).ok, true);
});
test('unidades enteras y sin merma para perchas', () => {
    const o = orders[1], l = pendingLines(o)[1], p = products.find((prod) => prod.code === l.productCode);
    const invalid = preparePick({ order: o, line: l, product: p, lot: p.lots[0], delivered: '1,5', waste: '0', picks: [] });
    assert.equal(invalid.ok, false);
});
test('documento cliente no lleva merma, lotes ni descuento stock', () => {
    const first = pick('4,50', '0,20').pick;
    const doc = buildOrderDraft(order, [first], products, ['101', '102'], 'entrega');
    assert.equal(doc.totalWaste, undefined);
    assert.equal(doc.totalStockDeduction, undefined);
    assert.equal(doc.lines[0].cuts, undefined);
    assert.equal(JSON.stringify(doc).includes('DEMO-L-100'), false);
    assert.equal(doc.totalDelivered, '4,5 m');
});
test('parte interno detalla merma y lote', () => {
    const first = pick('4,50', '0,20').pick;
    const doc = buildOrderDraft(order, [first], products, ['101', '102'], 'interno');
    assert.equal(doc.totalWaste, '0,2 m');
    assert.equal(doc.totalStockDeduction, '4,7 m');
    assert.equal(doc.lines[0].cuts[0].lotCode, lot.code);
});
test('sumas de metros y unidades no se mezclan', () => {
    const nextOrder = orders[1], p1 = products[0], p2 = products[2];
    const l1 = pendingLines(nextOrder)[0], l2 = pendingLines(nextOrder)[1];
    const first = preparePick({ order: nextOrder, line: l1, product: p1, lot: p1.lots[0], delivered: '2', waste: '0', picks: [] }).pick;
    const second = preparePick({ order: nextOrder, line: l2, product: p2, lot: p2.lots[0], delivered: '1', waste: '0', picks: [first] }).pick;
    const progress = getOrderProgress(nextOrder, [first, second], products);
    assert.equal(formatUnitTotals(progress.totalsByUnit), '2 m + 1 ud');
});
test('intento de registrar en backend sigue bloqueado en simulación', async () => {
    await assert.rejects(sgaOrderGateway.confirmPreparation({}), /simulaci[oó]n/i);
});
