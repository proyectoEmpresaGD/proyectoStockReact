import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { newFairRequestId } from '../../src/utils/feriasRequestId.js';
import { normalizeFairSubmission } from '../services/feriasRules.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('genera UUID v4 en navegadores modernos sin depender de node:crypto', () => {
  const key = newFairRequestId({ randomUUID });
  assert.match(key, uuidPattern);
  const submitted = normalizeFairSubmission({requestKey:key,type:'CONTACTO',fair:'Paris Déco Off',clientKind:'NUEVO',privacyConfirmed:true,thankYou:false,client:{company:'Prueba',contact:'Ana',phone:'900000000'}});
  assert.equal(submitted.requestKey,key);
});

test('genera UUID v4 con getRandomValues si randomUUID no está disponible', () => {
  const legacyCrypto = { getRandomValues: arr => webcrypto.getRandomValues(arr) };
  const ids = Array.from({ length: 100 }, () => newFairRequestId(legacyCrypto));
  assert.equal(new Set(ids).size, 100);
  ids.forEach(id => assert.match(id,uuidPattern));
});

test('nunca usa Math.random si el dispositivo carece de criptografía segura', () => {
  assert.throws(() => newFairRequestId(null), /identificadores seguros/);
});
