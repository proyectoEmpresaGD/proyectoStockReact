// Política exclusivamente de Ferias: no cambia el correo de otros módulos.
// La decisión se toma en el servidor y se guarda con la solicitud.
export const FERIAS_TEST_MAILBOX = 'gerardo@cjmw.eu';

export function createFeriasMailPolicy(env = process.env) {
  const testMode = String(env.FERIAS_EMAIL_TEST_MODE ?? '').trim().toLowerCase() === 'true';
  return {
    testMode,
    testMailbox: testMode ? FERIAS_TEST_MAILBOX : null,
    destination(intendedRecipient) {
      return testMode ? FERIAS_TEST_MAILBOX : intendedRecipient;
    },
  };
}

// Los mensajes creados durante pruebas siguen siendo de prueba aunque
// se desactive la variable mientras permanecen en cola.
export function isFeriasTestMessage(messageId) {
  return /^<feria-test-[0-9a-f]+@cjmgroup\.es>$/i.test(String(messageId ?? ''));
}

export function prepareFeriasMailSubject(subject, isTest) {
  return isTest ? `[PRUEBA] ${subject}` : subject;
}
