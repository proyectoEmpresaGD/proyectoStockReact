import test from 'node:test';
import assert from 'node:assert/strict';
import { demoDraftKey, readDemoDraft, saveDemoDraft, removeDemoDraft, safeReceiptDraft,
    DEMO_DRAFT_MAX_AGE } from '../../src/sga/sgaTabletDemoDrafts.js';
import { addReceipt, LOT_MODE, pendingPurchaseLines, validateReceiptReview } from '../../src/sga/sgaReceiving.js';
import { MOVEMENT_TYPES, buildSgaPreview } from '../../src/sga/sgaRules.js';
import { validateSgaStep, validateSgaOperation } from '../../src/sga/sgaSteps.js';

function memoryStorage() {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key), data };
}
const opts = { kind: 'recepcion', operator: 'operario-1', resource: 'PP-12' };
const products = [
    { code: 'TEL', unit: 'm', tracksLots: true, lots: [] },
    { code: 'PER', unit: 'ud', tracksLots: false, stock: { physical: '8', reserved: '0' }, lots: [] },
];
const order = { id: 'PP-12', number: 'PP-12', lines: [
    { id: 'L1', status: 'P', productCode: 'TEL', description: 'Tela', quantity: '5' },
    { id: 'L2', status: 'P', productCode: 'PER', description: 'Percha', quantity: '3' },
] };

test('guarda y recupera borrador solo para la misma tablet/usuario/pedido', () => {
    const storage = memoryStorage();
    assert.equal(saveDemoDraft(storage, { ...opts, data: { orderId: 'PP-12', receipts: [] }, now: 1000 }), true);
    assert.deepEqual(readDemoDraft(storage, { ...opts, now: 1010 }), { orderId: 'PP-12', receipts: [] });
    assert.equal(readDemoDraft(storage, { ...opts, operator: 'otro', now: 1010 }), null);
    assert.equal(readDemoDraft(storage, { ...opts, resource: 'PP-13', now: 1010 }), null);
    assert.equal(removeDemoDraft(storage, opts), true);
    assert.equal(readDemoDraft(storage, { ...opts, now: 1020 }), null);
});
test('los borradores vencidos no se recuperan ni pasan a CDI', () => {
    const storage = memoryStorage();
    saveDemoDraft(storage, { ...opts, data: { x: 1 }, now: 1000 });
    assert.equal(readDemoDraft(storage, { ...opts, now: 1000 + DEMO_DRAFT_MAX_AGE + 1 }), null);
    assert.equal(storage.getItem(demoDraftKey('recepcion','operario-1','PP-12')), null);
});
test('borradores malformados o con otro tipo no son válidos', () => {
    const storage = memoryStorage();
    assert.equal(saveDemoDraft(storage, { kind: 'pedido-real', operator: 'A', data: {} }), false);
    storage.setItem(demoDraftKey(...['recepcion', 'operario-1', 'PP-12']), '{no-json');
    assert.equal(readDemoDraft(storage, opts), null);
    assert.equal(readDemoDraft(storage, { ...opts, operator: '' }), null);
});
test('reabre una recepción parcial de artículos por unidades sin fabricar lote', () => {
    const result = addReceipt({ order, line: order.lines[1], product: products[1], products,
        receipts: [], warehouse: '01', location: 'A1', quantity: '2', lotCode: null });
    assert.equal(result.ok, true);
    const data = { orderId: order.id, receipts: result.receipts, issuedLots: [], activeLineId: 'L2', warehouse: '01', location: 'A1' };
    assert.deepEqual(safeReceiptDraft(data, order, products, validateReceiptReview, pendingPurchaseLines)?.receipts, result.receipts);
    assert.equal(safeReceiptDraft({ ...data, orderId: 'OTRO' }, order, products, validateReceiptReview, pendingPurchaseLines), null);
});
test('rechaza la recuperación si una línea ha cambiado o aparece un lote duplicado', () => {
    const first = addReceipt({ order, line: order.lines[0], product: products[0], products,
        equivalences: [{ codequiv: 'EQ1', codprodu: 'TEL' }], equivalence: { codequiv: 'EQ1', codprodu: 'TEL' },
        receipts: [], warehouse: '01', location: 'A1', quantity: '2', lotCode: 'LT-1', mode: LOT_MODE.MANUAL });
    assert.equal(first.ok, true);
    const data = { orderId: order.id, receipts: [first.receipt, { ...first.receipt, id: '2' }], issuedLots: ['LT-1'] };
    assert.equal(safeReceiptDraft(data, order, products, validateReceiptReview, pendingPurchaseLines), null);
    assert.equal(safeReceiptDraft({ ...data, receipts: first.receipts }, { ...order, id: 'otro' }, products, validateReceiptReview, pendingPurchaseLines), null);
});
test('regularización por unidades sin lotes valida ubicación y contado pero no exige lote', () => {
    const product = products[1];
    const form = { warehouse: '01', location: 'A1', lotCode: '', counted: '6', reason: 'RECUENTO', note: '' };
    const values = { type: MOVEMENT_TYPES.ADJUST, product, lot: null, form };
    assert.deepEqual(validateSgaStep(1, values), []);
    assert.deepEqual(validateSgaOperation(values), []);
    const preview = buildSgaPreview({ ...values, ...form });
    assert.equal(preview.movement.stockDelta, -2);
    assert.equal(preview.movement.lotCode, null);
});
test('regularización sin lotes no puede dejar menos físico que reservado', () => {
    const product = { ...products[1], stock: { physical: '8', reserved: '4' } };
    const values = { type: MOVEMENT_TYPES.ADJUST, product, lot: null,
        form: { warehouse: '01', location: 'A1', counted: '3', reason: 'RECUENTO' } };
    assert.ok(validateSgaOperation(values).some((e) => /reservado/i.test(e)));
});
