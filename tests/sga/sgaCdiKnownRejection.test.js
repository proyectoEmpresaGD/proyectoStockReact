import test from 'node:test';
import assert from 'node:assert/strict';
import { stateAfterCdiReconcile } from '../../server/services/sgaCdiTestOperations.js';

test('rechazo explícito: releer pendientes no lo transforma en albarán pendiente', () => {
  assert.equal(stateAfterCdiReconcile({ state: 'REJECTED', errorCode: 'DATOS_NO_VALIDOS', hasConfirmedResponse: false, pendingMatches: false }), 'REJECTED');
  assert.equal(stateAfterCdiReconcile({ state: 'REJECTED', errorCode: 'DATOS_NO_VALIDOS', hasConfirmedResponse: false, pendingMatches: true }), 'REJECTED');
});

test('operación antigua CHECK_PENDING con DATOS_NO_VALIDOS y sin confirmación se recupera como rechazo', () => {
  assert.equal(stateAfterCdiReconcile({ state: 'CHECK_PENDING', errorCode: 'DATOS_NO_VALIDOS', hasConfirmedResponse: false, pendingMatches: false }), 'REJECTED');
});

test('una confirmación efectiva no se reclasifica como rechazo por código antiguo', () => {
  assert.equal(stateAfterCdiReconcile({ state: 'CHECK_PENDING', errorCode: 'DATOS_NO_VALIDOS', hasConfirmedResponse: true, pendingMatches: true }), 'VERIFIED_PENDING');
});

test('un resultado incierto sigue en conciliación; no se infiere fracaso', () => {
  for (const state of ['SENDING', 'UNCERTAIN', 'RETRYABLE']) {
    assert.equal(stateAfterCdiReconcile({ state, errorCode: 'CDI_TEST_TRANSPORT_UNCERTAIN', hasConfirmedResponse: false, pendingMatches: true }), 'CHECK_PENDING');
  }
});
