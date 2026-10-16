import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT_TYPES, buildSgaPreview } from '../../src/sga/sgaRules.js';
import { validateSgaStep, validateSgaOperation, SGA_STEPS } from '../../src/sga/sgaSteps.js';
import { buildSgaDraft } from '../../src/sga/sgaDocuments.js';

const product = { code: 'PR1', description: 'Tela prueba', unit: 'm' };
const lot = { code: 'LOT-1', physical: '30.00', reserved: '5.00' };
const form = { warehouse: 'A', location: 'B', lotCode: 'LOT-1', newLotCode: '', quantity: '4.50', waste: '0.20', counted: '29.00', reference: 'PED-2', reason: 'RECUENTO', note: '' };
const data = { type: MOVEMENT_TYPES.EXIT, product, lot, form };

test('cinco pantallas diferenciadas', () => assert.deepEqual(SGA_STEPS, ['Producto', 'Almacén y lote', 'Cantidades', 'Comprobar', 'Documento']));
test('no se avanza sin artículo', () => assert.ok(validateSgaStep(0, { ...data, product: null }).length));
test('no se avanza si falta almacén, lote o ubicación', () => {
    const missing = validateSgaStep(1, { ...data, lot: null, form: { ...form, warehouse: '', location: '' } });
    assert.equal(missing.length, 3);
});
test('la salida requiere referencia del pedido', () => {
    assert.ok(validateSgaStep(2, { ...data, form: { ...form, reference: '' } }).some((error) => error.includes('referencia')));
});
test('una entrada requiere documento de recepción', () => {
    const entry = { ...data, type: MOVEMENT_TYPES.ENTRY, form: { ...form, reference: '' } };
    assert.ok(validateSgaStep(2, entry).some((error) => error.includes('recepción')));
});
test('motivo OTROS obliga a explicarlo', () => {
    const adjust = { ...data, type: MOVEMENT_TYPES.ADJUST, form: { ...form, reason: 'OTROS', note: '' } };
    assert.ok(validateSgaStep(2, adjust).some((error) => error.includes('motivo')));
});
test('salida con stock insuficiente queda bloqueada', () => {
    assert.ok(validateSgaStep(2, { ...data, form: { ...form, quantity: '25', waste: '1' } }).some((error) => error.includes('suficiente')));
});
test('documento de cliente NO contiene merma ni cantidades de stock', () => {
    const preview = buildSgaPreview({ ...data, ...form });
    assert.equal(preview.valid, true);
    const outgoing = buildSgaDraft({ operation: MOVEMENT_TYPES.EXIT, preview, product, lot, kind: 'entrega' });
    const labels = outgoing.resultRows.map(([label]) => label).join('|').toLowerCase();
    assert.equal(outgoing.resultRows.length, 1);
    assert.equal(outgoing.resultRows[0][1], '4,5 m');
    assert.equal(labels.includes('merma'), false);
    assert.equal(labels.includes('stock'), false);
    assert.equal(outgoing.note, '');
});
test('parte interno recoge salida física y merma', () => {
    const preview = buildSgaPreview({ ...data, ...form });
    const internal = buildSgaDraft({ operation: MOVEMENT_TYPES.EXIT, preview, product, lot, kind: 'interno' });
    assert.ok(internal.resultRows.some(([label, value]) => label.includes('Merma') && value === '0,2 m'));
    assert.ok(internal.resultRows.some(([label, value]) => label.includes('Descuento total') && value === '4,7 m'));
});
test('no se puede generar documento de datos inválidos', () => {
    assert.throws(() => buildSgaDraft({ operation: MOVEMENT_TYPES.EXIT, preview: { valid: false }, product, lot }), /sin validar/);
});
test('validación global incluye los bloqueos por etapa', () => {
    const issues = validateSgaOperation({ ...data, form: { ...form, reference: '' } });
    assert.ok(issues.length > 0);
});
