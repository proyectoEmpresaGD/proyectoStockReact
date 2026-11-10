import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesPicking, assessSalesHandoff, verifySalesPending } from '../../server/services/sgaCdiSalesWorkflow.js';
import { validateCdiPicks } from '../../src/sga/sgaCdiPickingModel.js';

const identity = { tipo: 'PC', anio: '2026', serie: 'A', clave: '00002' };
const pending = { ok: true, token: 'TOK-1', lineas: [{ idlinea: 'L-1', codarticulo: 'SIN-LOTE', cantidad_pendiente: '5' }] };
const base = { ...identity, fecha: '2026-11-09', serie_destino: 'A', codalmacen: '01' };
const qty = (cantidad) => ({ idlinea: 'L-1', cantidad, nserie: '', ubicacion: '' });

test('producto por unidades: no se exige lote, ni se crea merma ni movimiento adicional', () => {
    const result = buildSalesPicking({ ...base, lineas: [qty('3')] }, pending);
    assert.deepEqual(result.write.lineas, [{ idlinea: 'L-1', cantidad: '3' }]);
    assert.equal(result.before.lines[0].expected_after, '2');
    assert.equal('nserie' in result.write.lineas[0], false);
    assert.equal('ubicacion' in result.write.lineas[0], false);
    assert.equal('merma' in result.write.lineas[0], false);
});

test('varias anotaciones sin lote de la misma línea se suman antes del envío a CDI', () => {
    const picks = [qty('1'), qty('2')];
    const lines = [{ idlinea: 'L-1', articulo: 'SIN-LOTE', pendiente: '5' }];
    assert.equal(validateCdiPicks(picks, lines), null);
    const result = buildSalesPicking({ ...base, lineas: picks }, pending);
    assert.deepEqual(result.write.lineas, [{ idlinea: 'L-1', cantidad: '3' }]);
    assert.equal(result.before.selections.length, 1);
    assert.equal(result.before.lines[0].expected_after, '2');
});

test('no permite servir más de lo pendiente sumando entradas sin lote', () => {
    assert.match(validateCdiPicks([qty('3'), qty('3')], [{ idlinea: 'L-1', articulo: 'SIN-LOTE', pendiente: '5' }]), /excede/i);
    assert.throws(() => buildSalesPicking({ ...base, lineas: [qty('3'), qty('3')] }, pending), { code: 'CDI_FLOW_EXCEEDS_PENDING' });
});

test('mantiene la protección contra doble lectura de una misma pieza con lote', () => {
    const pieces = [{ ...qty('1'), nserie: 'LOTE-123' }, { ...qty('2'), nserie: 'LOTE-123' }];
    assert.match(validateCdiPicks(pieces, [{ idlinea: 'L-1', articulo: 'TELA', pendiente: '5' }]), /mismo lote/i);
    assert.throws(() => buildSalesPicking({ ...base, lineas: pieces }, pending), { code: 'CDI_FLOW_DUPLICATE_CUT' });
});

test('una operación sin confirmación de servir sigue bloqueada aunque se concilie el pendiente', () => {
    const before = buildSalesPicking({ ...base, lineas: [qty('3')] }, pending).before;
    const verified = verifySalesPending(before, { ok: true, token: 'TOK-2', lineas: [{ idlinea: 'L-1', cantidad_pendiente: '2' }] });
    assert.equal(verified.pendingMatches, true);
    const handoff = assessSalesHandoff({ before_data: before, result_data: null, verification_data: verified });
    assert.equal(handoff.status, 'WAITING_ERP_CONFIRMATION');
    assert.equal(handoff.invoiceCreated, false);
});
