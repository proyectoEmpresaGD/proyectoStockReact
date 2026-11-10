import test from 'node:test';
import assert from 'node:assert/strict';
import { composeTabletReviewReason, describeTabletSaveState, describeTabletOperationResult, TABLET_REVIEW_ACTIONS } from '../../src/sga/sgaTabletAssistance.js';

test('tablets: todos los motivos predefinidos cumplen el contrato auditable 15..500 caracteres', () => {
    for (const action of Object.values(TABLET_REVIEW_ACTIONS)) {
        for (const option of action.options) {
            assert.equal(composeTabletReviewReason(option), option);
            assert.ok(option.length >= 15 && option.length <= 500);
        }
    }
});

test('tablets: otros motivos exigen explicación de al menos 15 caracteres', () => {
    assert.equal(composeTabletReviewReason('', 'corta', { other: true }), '');
    assert.equal(composeTabletReviewReason('', 'He contado las cinco piezas', { other: true }), 'He contado las cinco piezas');
});

test('tablets: los motivos largos no se envían ni se truncan silenciosamente', () => {
    assert.equal(composeTabletReviewReason('Motivo válido', 'x'.repeat(500)), '');
});

test('tablets: notas adicionales mantienen el motivo elegido para la auditoría', () => {
    assert.equal(composeTabletReviewReason('Cambio de turno: continuará otro momento', 'Han quedado dos cajas aparte'),
        'Cambio de turno: continuará otro momento. Han quedado dos cajas aparte');
});

test('tablets: guardando y error bloquean avanzar, guardado permite revisar', () => {
    assert.equal(describeTabletSaveState('saved').allowsNext, true);
    assert.equal(describeTabletSaveState('saving').allowsNext, false);
    assert.equal(describeTabletSaveState('error').allowsNext, false);
    assert.equal(describeTabletSaveState('saved', { paused: true }).allowsNext, false);
    assert.equal(describeTabletSaveState('saved', { sealed: true }).allowsNext, false);
});

test('tablets: operación incierta no se muestra como completada', () => {
    const state = describeTabletOperationResult('VERIFIED', { verified: true, uncertain: true });
    assert.notEqual(state.tone, 'success');
    assert.match(state.message, /No pulses generar de nuevo/);
});

test('tablets: el rechazo y la pausa tienen instrucciones distintas', () => {
    assert.match(describeTabletOperationResult('REJECTED').message, /Avisa al responsable/);
    assert.match(describeTabletOperationResult('PAUSED').message, /No se ha enviado/);
});

test('tablets: solo un albarán verificado ofrece estado positivo', () => {
    assert.equal(describeTabletOperationResult('VERIFIED', { verified: true }).tone, 'success');
    assert.notEqual(describeTabletOperationResult('CHECK_PENDING').tone, 'success');
});
