import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import {
  isTransientDatabaseError,
  retryDatabaseRead,
  attachPoolErrorHandler,
} from '../../server/db/postgresResilience.js';
import { createAuthMiddleware } from '../../server/middlewares/authMiddlewareCore.js';

const codeError = (code) => Object.assign(new Error('Fallo simulado'), { code });
const response = () => ({
  statusCode: null, payload: null, headers: {},
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
  setHeader(key, value) { this.headers[key] = value; },
});
const request = (token = 'valido') => ({ headers: { authorization: `Bearer ${token}` } });

for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', '08006', '57P01']) {
  test(`clasifica la caída transitoria ${code}`, () => {
    assert.equal(isTransientDatabaseError(codeError(code)), true);
    assert.equal(isTransientDatabaseError({ cause: codeError(code) }), true);
  });
}

test('no reintenta errores SQL de parámetros, permisos, credenciales ni consultas', async () => {
  for (const code of ['08P01', '23505', '42501', '28P01', '22P02']) {
    let count = 0;
    await assert.rejects(retryDatabaseRead(async () => { count++; throw codeError(code); }, { wait: async () => {} }), { code });
    assert.equal(count, 1, code);
  }
});

test('reintenta lecturas y devuelve el resultado tras recuperar la conexión', async () => {
  const delays = [];
  let calls = 0;
  const data = await retryDatabaseRead(async () => {
    calls++;
    if (calls < 3) throw codeError('ENOTFOUND');
    return { rows: [{ id: 12 }] };
  }, { wait: async (delay) => delays.push(delay) });
  assert.deepEqual(data, { rows: [{ id: 12 }] });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [200, 600]);
});

test('acota el número de intentos en una caída persistente', async () => {
  let calls = 0;
  await assert.rejects(retryDatabaseRead(async () => {
    calls++;
    throw codeError('EAI_AGAIN');
  }, { wait: async () => {} }), { code: 'EAI_AGAIN' });
  assert.equal(calls, 3);
});

test('un error de cliente ocioso de pg no termina el proceso y no instala listeners dobles', () => {
  const pool = new EventEmitter();
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    attachPoolErrorHandler(pool, 'prueba');
    attachPoolErrorHandler(pool, 'prueba');
    assert.equal(pool.listenerCount('error'), 1);
    pool.emit('error', codeError('ECONNRESET'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /ECONNRESET/);
  } finally {
    console.warn = original;
  }
});

test('token ausente, token inválido y usuario inexistente siguen dando 401', async () => {
  const middleware = createAuthMiddleware({
    verifyToken(token) { if (token !== 'valido') throw Error('invalid'); return { id: 1 }; },
    findUser: async () => null,
  });
  for (const token of [undefined, 'invalido', 'valido']) {
    const res = response();
    let nextCalled = false;
    await middleware(token === undefined ? { headers: {} } : request(token), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  }
});

test('la caída de Neon devuelve 503 sin asignar permisos ni cerrar la sesión', async () => {
  const middleware = createAuthMiddleware({
    verifyToken: () => ({ id: 99 }),
    findUser: async () => { throw codeError('ENOTFOUND'); },
  });
  const req = request();
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '2');
  assert.equal(req.user, undefined);
  assert.equal(nextCalled, false);
  assert.equal(res.payload?.message?.includes('token'), false);
});

test('usuario válido conserva el objeto original, su rol y permisos individuales', async () => {
  const user = { id: 10, role: 'ventas', route_access: { '/entradas': 'allow' } };
  const middleware = createAuthMiddleware({ verifyToken: () => ({ id: 10 }), findUser: async () => user });
  const req = request();
  let nextCalled = 0;
  await middleware(req, response(), () => { nextCalled++; });
  assert.equal(req.user, user);
  assert.equal(nextCalled, 1);
});

test('errores de consulta no transitorios no se transforman en falsas sesiones expiradas', async () => {
  const middleware = createAuthMiddleware({
    verifyToken: () => ({ id: 10 }),
    findUser: async () => { throw codeError('42501'); },
  });
  const previous = console.error;
  console.error = () => {};
  try {
    const res = response();
    await middleware(request(), res, () => assert.fail('No debe continuar'));
    assert.equal(res.statusCode, 500);
  } finally { console.error = previous; }
});

test('las únicas consultas con retry en UserModel son SELECT de autenticación', () => {
  const src = readFileSync(new URL('../../server/models/Postgres/usuarios.js', import.meta.url), 'utf8');
  assert.match(src, /static async findByUsername[\s\S]*?retryDatabaseRead\(\(\) => pool\.query\(query, values\)\)/);
  assert.match(src, /static async findById[\s\S]*?retryDatabaseRead\(\(\) => pool\.query\(query, values\)\)/);
  assert.doesNotMatch(src, /retryDatabaseRead\([\s\S]{0,40}UPDATE usuarios/);
});
