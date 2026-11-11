import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FERIAS_TEST_MAILBOX,
  createFeriasMailPolicy,
  isFeriasTestMessage,
  prepareFeriasMailSubject,
} from '../services/feriasMailRouting.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const code = relative => readFileSync(resolve(projectRoot, relative), 'utf8');

test('modo pruebas: las dos clases de correo se redirigen exclusivamente a Gerardo', () => {
  const policy = createFeriasMailPolicy({FERIAS_EMAIL_TEST_MODE: 'true'});
  assert.equal(policy.testMode, true);
  assert.equal(policy.testMailbox, 'gerardo@cjmw.eu');
  assert.equal(policy.destination('pedidos@cjmgroup.es'), FERIAS_TEST_MAILBOX);
  assert.equal(policy.destination('cliente@ejemplo.com'), FERIAS_TEST_MAILBOX);
});

test('modo normal: cada correo utiliza su destinatario original', () => {
  for (const value of [undefined, '', 'false', '0']) {
    const policy = createFeriasMailPolicy({FERIAS_EMAIL_TEST_MODE: value});
    assert.equal(policy.testMode, false);
    assert.equal(policy.destination('pedidos@cjmgroup.es'), 'pedidos@cjmgroup.es');
    assert.equal(policy.destination('cliente@ejemplo.com'), 'cliente@ejemplo.com');
  }
});

test('la marca persistente identifica un correo de prueba incluso después de desactivar la variable', () => {
  assert.ok(isFeriasTestMessage('<feria-test-a38db6c9@cjmgroup.es>'));
  assert.ok(!isFeriasTestMessage('<feria-a38db6c9@cjmgroup.es>'));
  assert.equal(prepareFeriasMailSubject('Gracias por venir', true), '[PRUEBA] Gracias por venir');
  assert.equal(prepareFeriasMailSubject('Gracias por venir', false), 'Gracias por venir');
});

test('el backend guarda el destino redirigido, marca el mensaje e intercepta antiguos pendientes al enviar', () => {
  const service = code('server/services/feriasService.js');
  assert.match(service, /const to = mailPolicy\.destination\(intendedTo\)/);
  assert.match(service, /const testMarker = mailPolicy\.testMode \? 'test-' : ''/);
  assert.match(service, /destinatario=CASE WHEN \$3::boolean THEN \$4::text ELSE destinatario END/);
  assert.match(service, /mailPolicy\.testMode \|\| isFeriasTestMessage\(notification\.message_id\)/);
  assert.match(service, /to:notification\.destinatario/);
  assert.match(service, /MODO PRUEBA: no enviado al destinatario final/);
});

test('la interfaz enseña el modo pruebas y la ruta de estado lo comunica', () => {
  assert.match(code('server/routes/ferias.js'), /mailTestMode:service\.mailTestMode/);
  assert.match(code('src/pages/FeriasPage.jsx'), /Modo prueba de correos activado/);
});
