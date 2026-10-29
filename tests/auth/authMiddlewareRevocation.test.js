import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthMiddleware } from '../../server/middlewares/authMiddlewareCore.js';

const invoke = async ({ findUser, verifyToken = () => ({ id: 4 }) }) => {
    const req = { headers: { authorization: 'Bearer valid' } };
    let status = 200;
    let payload;
    let nextCount = 0;
    const res = {
        status(code) { status = code; return this; },
        json(body) { payload = body; return this; },
        setHeader() { return this; },
    };
    await createAuthMiddleware({ findUser, verifyToken })(req, res, () => { nextCount++; });
    return { status, payload, nextCount, user: req.user };
};

test('permite sesiones marcadas como activas', async () => {
    const result = await invoke({ findUser: async () => ({ id: 4, active_session: true }) });
    assert.equal(result.nextCount, 1);
    assert.equal(result.user.id, 4);
});

test('mantiene compatibilidad con registros históricos sin bandera active_session', async () => {
    const result = await invoke({ findUser: async () => ({ id: 4, active_session: null }) });
    assert.equal(result.nextCount, 1);
});

test('revocación explícita de sesión rechaza el JWT anterior', async () => {
    const result = await invoke({ findUser: async () => ({ id: 4, active_session: false }) });
    assert.equal(result.status, 401);
    assert.equal(result.nextCount, 0);
});

test('un usuario que ya no existe no puede autenticarse', async () => {
    const result = await invoke({ findUser: async () => null });
    assert.equal(result.status, 401);
});

test('un token inválido devuelve 401 sin consultar la base de datos', async () => {
    let queried = false;
    const result = await invoke({
        verifyToken: () => { throw new Error('expired'); },
        findUser: async () => { queried = true; return {}; },
    });
    assert.equal(result.status, 401);
    assert.equal(queried, false);
});
