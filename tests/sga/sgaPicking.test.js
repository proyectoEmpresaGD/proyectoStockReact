import test from 'node:test';
import assert from 'node:assert/strict';
import { sgaGateway, sgaOrderGateway } from '../../src/sga/sgaGateway.js';
import {
    pendingLines, getLineProgress, getOrderProgress, lotAvailable, resolveScannedCode,
    preparePick, validateOrderReview, formatUnitTotals,
    CUT_WASTE_HUNDREDTHS, REMAINDER_ACTIONS, getCutRemainder, decideRemainder, lotPhysicalRemainder, stockEntries,
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
    assert.match(result.message, /otro producto/i);
});
test('QR de producto distinto a la línea muestra aviso claro', () => {
    const otherCode = products.find((candidate) => candidate.code !== line.productCode)?.code;
    const result = resolveScannedCode(otherCode, line, products);
    assert.equal(result.ok, false);
    assert.match(result.message, /otro producto/i);
});
test('QR desconocido se rechaza y no se interpreta como lote', () => {
    const result = resolveScannedCode('LOTE-INEXISTENTE-123', line, products);
    assert.equal(result.ok, false);
    assert.match(result.message, /no reconocido/i);
});
test('4,50 m cliente llevan 0,10 m fijos: 4,60 m de stock', () => {
    const result = pick('4,50', '0,20');
    assert.equal(result.ok, true);
    assert.equal(result.pick.delivered, 4.5);
    assert.equal(result.pick.waste, .1);
    assert.equal(result.pick.stockDeduction, 4.6);
});
test('no se puede cortar más de la línea pedida', () => {
    const result = pick('9,51', '0');
    assert.equal(result.ok, false);
});
test('merma + entrega no pueden superar disponibilidad de lote', () => {
    const shortLot = { ...lot, physical: '1.09', reserved: '0' };
    const shortProduct = { ...product, lots: [shortLot] };
    const result = preparePick({ order, line, product: shortProduct, lot: shortLot, delivered: '1,00', picks: [] });
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
    assert.equal(lotAvailable(product, lot, [first.pick]), 12.7);
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
    assert.equal(doc.totalWaste, '0,1 m');
    assert.equal(doc.totalStockDeduction, '4,6 m');
    assert.equal(doc.lines[0].cuts[0].lotCode, lot.code);
});
test('sumas de metros y unidades no se mezclan', () => {
    const nextOrder = orders[1], p1 = products[0], p2 = products[2];
    const l1 = pendingLines(nextOrder)[0], l2 = pendingLines(nextOrder)[1];
    const first = preparePick({ order: nextOrder, line: l1, product: p1, lot: p1.lots[0], delivered: '2', waste: '0', picks: [] }).pick;
    const second = preparePick({ order: nextOrder, line: l2, product: p2, lot: stockEntries(p2)[0], delivered: '1', waste: '0', picks: [first] }).pick;
    const progress = getOrderProgress(nextOrder, [first, second], products);
    assert.equal(formatUnitTotals(progress.totalsByUnit), '2 m + 1 ud');
});
test('intento de registrar en backend sigue bloqueado en simulación', async () => {
    await assert.rejects(sgaOrderGateway.confirmPreparation({}), /simulaci[oó]n/i);
});

const remainderDemoLot = { code: 'RESTO-PRUEBA', physical: '1.60', reserved: '0' };
const remainderDemoProduct = { ...product, lots: [remainderDemoLot] };
const smallPick = () => preparePick({ order, line, product: remainderDemoProduct, lot: remainderDemoLot, delivered: '1,00', picks: [] });

test('la merma de tejido es SIEMPRE 0,10 por cada corte, sin aceptar valores editados', () => {
    assert.equal(CUT_WASTE_HUNDREDTHS, 10);
    const first = preparePick({ order, line, product, lot, delivered: '1', waste: '0,50', picks: [] });
    const second = preparePick({ order, line, product, lot, delivered: '1', waste: '0', picks: [first.pick] });
    assert.equal(first.pick.waste, .1);
    assert.equal(second.pick.waste, .1);
    assert.equal(getOrderProgress(order, [first.pick, second.pick], products).waste, .2);
});
test('exactamente 0,50 m restantes dispara elección', () => {
    const result = smallPick();
    assert.equal(result.ok, true);
    assert.equal(result.remainder.physicalAfterCut, .5);
    assert.equal(result.requiresRemainderDecision, true);
});
test('con 0,51 m no exige elegir; con 0 se agota sin traslado', () => {
    const biggerLot = { ...remainderDemoLot, physical: '1.61' };
    const biggerProduct = { ...product, lots: [biggerLot] };
    const bigger = preparePick({ order, line, product: biggerProduct, lot: biggerLot, delivered: '1', picks: [] });
    assert.equal(bigger.requiresRemainderDecision, false);
    const emptyLot = { ...remainderDemoLot, physical: '1.10' };
    const emptyProduct = { ...product, lots: [emptyLot] };
    assert.equal(preparePick({ order, line, product: emptyProduct, lot: emptyLot, delivered: '1', picks: [] }).requiresRemainderDecision, false);
});
test('las cuatro decisiones capturan el mismo resto y dejan cantidades coherentes', () => {
    const base = smallPick();
    for (const action of Object.values(REMAINDER_ACTIONS)) {
        const decision = decideRemainder({ pick: base.pick, product: remainderDemoProduct, lot: remainderDemoLot, action });
        assert.equal(decision.ok, true);
        assert.equal(decision.pick.remainderDecision.physicalAfterCut, .5);
        assert.equal(decision.pick.waste, .1);
        assert.equal(decision.pick.remainderDecision.stockReduction, action === REMAINDER_ACTIONS.KEEP ? 0 : .5);
        assert.equal(lotPhysicalRemainder(remainderDemoProduct, remainderDemoLot, [decision.pick]), action === REMAINDER_ACTIONS.KEEP ? .5 : 0);
    }
});
test('lotes con reserva: conservar permitido, regularizar y trasladar rechazados', () => {
    const reservedLot = { ...remainderDemoLot, physical: '1.80', reserved: '0.20' };
    const reservedProduct = { ...product, lots: [reservedLot] };
    const base = preparePick({ order, line, product: reservedProduct, lot: reservedLot, delivered: '1.20', picks: [] });
    assert.equal(base.remainder.physicalAfterCut, .5);
    assert.equal(decideRemainder({ pick: base.pick, product: reservedProduct, lot: reservedLot, action: REMAINDER_ACTIONS.KEEP }).ok, true);
    for (const action of [REMAINDER_ACTIONS.ZERO, REMAINDER_ACTIONS.QUALITY, REMAINDER_ACTIONS.CONFECCION]) {
        assert.equal(decideRemainder({ pick: base.pick, product: reservedProduct, lot: reservedLot, action }).ok, false);
    }
});
test('regularizar resto a 0 añade ajuste interno pero nunca factura más metros', () => {
    const base = smallPick();
    const decision = decideRemainder({ pick: base.pick, product: remainderDemoProduct, lot: remainderDemoLot, action: REMAINDER_ACTIONS.ZERO });
    const doc = buildOrderDraft(order, [decision.pick], [remainderDemoProduct, ...products.slice(1)], ['101', '102'], 'interno');
    const lineDoc = doc.lines[0];
    assert.equal(lineDoc.delivered, '1 m');
    assert.equal(lineDoc.cuts[0].remainder.adjustment, '0,5 m');
    assert.equal(doc.totalWaste, '0,1 m');
    assert.equal(doc.totalRegularized, '0,5 m');
    assert.equal(doc.totalSourceReduction, '1,6 m');
    const clientDoc = buildOrderDraft(order, [decision.pick], [remainderDemoProduct, ...products.slice(1)], ['101', '102'], 'entrega');
    assert.equal(JSON.stringify(clientDoc).includes('regularizacion'), false);
    assert.equal(JSON.stringify(clientDoc).includes('RESTO-PRUEBA'), false);
    assert.equal(clientDoc.totalStockDeduction, undefined);
});
test('traslado de resto a Quality se refleja solo en el parte interno', () => {
    const base = smallPick();
    const decision = decideRemainder({ pick: base.pick, product: remainderDemoProduct, lot: remainderDemoLot, action: REMAINDER_ACTIONS.QUALITY });
    assert.equal(decision.pick.remainderDecision.warehouseDestination, 'DEMO-QUALITY');
    const intern = buildOrderDraft(order, [decision.pick], [remainderDemoProduct, ...products.slice(1)], ['101', '102'], 'interno');
    assert.equal(intern.totalTransferred, '0,5 m');
    assert.equal(intern.lines[0].cuts[0].remainder.transfer.destination, 'Almacén de Quality');
    const client = buildOrderDraft(order, [decision.pick], [remainderDemoProduct, ...products.slice(1)], ['101', '102'], 'entrega');
    assert.equal(JSON.stringify(client).includes('Quality'), false);
});
test('stock simulado del lote descuenta también ajuste o traslado y se libera al quitar el corte', () => {
    const base = smallPick();
    const decision = decideRemainder({ pick: base.pick, product: remainderDemoProduct, lot: remainderDemoLot, action: REMAINDER_ACTIONS.CONFECCION });
    assert.equal(lotAvailable(remainderDemoProduct, remainderDemoLot, [decision.pick]), 0);
    assert.equal(lotAvailable(remainderDemoProduct, remainderDemoLot, []), 1.6);
});
test('merma no aplica a productos contados por unidades', () => {
    const o = orders[1], l = pendingLines(o)[1], p = products.find((item) => item.code === l.productCode);
    const result = preparePick({ order: o, line: l, product: p, lot: stockEntries(p)[0], delivered: '1', picks: [] });
    assert.equal(result.ok, true);
    assert.equal(result.pick.waste, 0);
    assert.equal(result.requiresRemainderDecision, false);
});

test('artículos sin lote se preparan por unidades con stock agregado', () => {
    const o = orders[1], l = pendingLines(o)[1], p = products.find((item) => item.code === l.productCode);
    const result = preparePick({ order: o, line: l, product: p, lot: stockEntries(p)[0], delivered: '2', picks: [] });
    assert.equal(result.ok, true);
    assert.equal(result.pick.lotCode, null);
    assert.equal(result.pick.waste, 0);
    assert.equal(getOrderProgress(o, [result.pick], products).lines[1].available, 33);
});
