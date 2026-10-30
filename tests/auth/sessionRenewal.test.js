import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../../src/Auth/sessionManager.js';
import { installAuthenticatedFetch } from '../../src/Auth/authTransport.js';

const clock = { ms: 2_000_000_000_000 };
const sign = (expiryMs, id = 10) => {
    const encode = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encode({ alg: 'HS256' })}.${encode({ id, exp: Math.ceil(expiryMs / 1000) })}.sig`;
};
const storage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const response = (code, data = {}) => ({ status: code, ok: code >= 200 && code < 300, json: async () => data });
const create = (initial, fetchImpl) => {
    const store = storage(initial);
    return { store, manager: createSessionManager({ storage: store, fetchImpl, now: () => clock.ms, apiBase: 'https://backend.test' }) };
};
const oldToken = () => sign(clock.ms + 2 * 60_000);
const nextToken = () => sign(clock.ms + 60 * 60_000);

test('renueva cinco minutos antes de la caducidad y guarda el nuevo JWT', async () => {
    const next = nextToken();
    let calls = 0;
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async (url, init) => {
        calls += 1;
        assert.equal(url, 'https://backend.test/api/auth/refresh');
        assert.equal(JSON.parse(init.body).refreshToken, 'refresh-A');
        return response(200, { token: next });
    });
    assert.equal(await manager.ensureFreshToken(), next);
    assert.equal(store.getItem('token'), next);
    assert.equal(calls, 1);
    assert.equal(await manager.ensureFreshToken(), next);
    assert.equal(calls, 1);
});

test('no renueva un JWT lejano a su caducidad', async () => {
    const token = nextToken();
    const { manager } = create({ token, refreshToken: 'refresh-A' }, () => { throw new Error('no debería invocarse'); });
    assert.equal(await manager.ensureFreshToken(), token);
});

test('reutiliza una única petición concurrente para varias pantallas', async () => {
    let calls = 0;
    const { manager } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return response(200, { token: nextToken() });
    });
    const values = await Promise.all(Array.from({ length: 15 }, () => manager.ensureFreshToken()));
    assert.equal(calls, 1);
    assert.ok(values.every((v) => v === nextToken()));
});

test('un fallo de red no borra los tokens', async () => {
    const old = oldToken();
    const { manager, store } = create({ token: old, refreshToken: 'refresh-A' }, async () => { throw new Error('ENETUNREACH'); });
    assert.equal(await manager.ensureFreshToken(), old);
    assert.equal(store.getItem('token'), old);
    assert.equal(store.getItem('refreshToken'), 'refresh-A');
    assert.equal(manager.getStatus(), 'temporary-error');
});

test('un 503 de PostgreSQL no cierra la sesión y la siguiente renovación funciona', async () => {
    let count = 0;
    const { manager } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => {
        count += 1;
        return count === 1 ? response(503) : response(200, { token: nextToken() });
    });
    await manager.ensureFreshToken();
    assert.equal(manager.getStatus(), 'temporary-error');
    assert.equal(await manager.ensureFreshToken(), nextToken());
    assert.equal(manager.getStatus(), 'ok');
});

test('un 403 de renovación avisa y conserva el acceso hasta que caduque', async () => {
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => response(403));
    assert.equal(await manager.ensureFreshToken(), oldToken());
    assert.equal(store.getItem('token'), oldToken());
    assert.equal(store.getItem('refreshToken'), 'refresh-A');
    assert.equal(manager.getStatus(), 'reauth-required');
    const initial = clock.ms;
    try {
        clock.ms += 3 * 60_000;
        assert.equal(await manager.ensureFreshToken(), null);
        assert.equal(store.getItem('token'), null);
        assert.equal(manager.getSessionEndReason(), 'expired');
    } finally { clock.ms = initial; }
});

test('sin refresh token y con acceso caducado finaliza la sesión', async () => {
    const { manager } = create({ token: sign(clock.ms - 60_000) }, async () => response(200));
    assert.equal(await manager.ensureFreshToken(), null);
    assert.equal(manager.getToken(), null);
});

test('un refresh antiguo no puede sobrescribir un login realizado durante la petición', async () => {
    let finish;
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => new Promise((resolve) => { finish = resolve; }));
    const pending = manager.ensureFreshToken();
    const newLogin = sign(clock.ms + 15 * 60_000, 20);
    manager.login(newLogin, 'refresh-B');
    finish(response(403));
    assert.equal(await pending, newLogin);
    assert.equal(store.getItem('refreshToken'), 'refresh-B');
});

test('cuando una pestaña recibe un token renovado, las demás pueden actualizarse', () => {
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => response(200));
    let latest;
    manager.subscribe((event) => { latest = event; });
    store.setItem('token', nextToken());
    manager.syncExternalChange();
    assert.equal(latest.token, nextToken());
    assert.equal(latest.reason, 'external');
});

test('fetch usa automáticamente el token nuevo en lugar del almacenado en un closure antiguo', async () => {
    const stale = oldToken();
    let authHeader;
    const { manager } = create({ token: stale, refreshToken: 'refresh-A' }, async () => response(200, { token: nextToken() }));
    const target = {
        location: { href: 'https://frontend.test/app' },
        fetch: async (url, opts) => {
            authHeader = new Headers(opts.headers).get('Authorization');
            return response(200, { ok: true });
        },
    };
    installAuthenticatedFetch(target, manager, 'https://backend.test');
    const result = await target.fetch('https://backend.test/api/stock', { headers: { Authorization: `Bearer ${stale}` } });
    assert.equal(result.status, 200);
    assert.equal(authHeader, `Bearer ${nextToken()}`);
});

test('fetch reintenta un 401 solo una vez y no reenvía Authorization a otros dominios', async () => {
    const stale = nextToken();
    let fetchCalls = 0;
    let refreshCalls = 0;
    const { manager } = create({ token: stale, refreshToken: 'refresh-A' }, async () => { refreshCalls++; return response(200, { token: sign(clock.ms + 90 * 60_000) }); });
    const target = {
        location: { href: 'https://frontend.test/app' },
        fetch: async (url, opts) => {
            fetchCalls++;
            return response(url.startsWith('https://backend.test/') && fetchCalls === 1 ? 401 : 200);
        },
    };
    installAuthenticatedFetch(target, manager, 'https://backend.test');
    assert.equal((await target.fetch('https://backend.test/api/stock', { headers: { Authorization: `Bearer ${stale}` } })).status, 200);
    assert.equal(fetchCalls, 2);
    assert.equal(refreshCalls, 1);
    await target.fetch('https://other.test/api/stock', { headers: { Authorization: 'Bearer outside' } });
    assert.equal(refreshCalls, 1);
    assert.equal(fetchCalls, 3);
});

test('fetch no reintenta eternamente respuestas 401 persistentes', async () => {
    const stale = nextToken();
    let calls = 0;
    const { manager } = create({ token: stale, refreshToken: 'refresh-A' }, async () => response(200, { token: sign(clock.ms + 90 * 60_000) }));
    const target = { location: { href: 'https://frontend.test/' }, fetch: async () => { calls++; return response(401); } };
    installAuthenticatedFetch(target, manager, 'https://backend.test');
    assert.equal((await target.fetch('https://backend.test/api/stock', { headers: { Authorization: `Bearer ${stale}` } })).status, 401);
    assert.equal(calls, 2);
    assert.equal(manager.getToken(), sign(clock.ms + 90 * 60_000));
});

test('rotar el refresh renueva también la fecha límite de la sesión activa', async () => {
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => response(200, {
        token: nextToken(), refreshToken: 'refresh-B',
    }));
    await manager.ensureFreshToken();
    assert.equal(store.getItem('refreshToken'), 'refresh-B');
    assert.equal(store.getItem('token'), nextToken());
});

test('409 de renovación simultánea no expulsa al usuario y permite otro intento', async () => {
    let n = 0;
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => {
        n += 1;
        return n === 1 ? response(409) : response(200, { token: nextToken(), refreshToken: 'refresh-B' });
    });
    await manager.ensureFreshToken();
    assert.equal(store.getItem('refreshToken'), 'refresh-A');
    assert.equal(manager.getStatus(), 'temporary-error');
    assert.equal(await manager.ensureFreshToken(), nextToken());
    assert.equal(store.getItem('refreshToken'), 'refresh-B');
});

test('no expulsa en una carrera entre pestañas cuando el token de renovación cambia', async () => {
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => {
        setTimeout(() => {
            store.setItem('refreshToken', 'refresh-B');
            store.setItem('token', nextToken());
        }, 10);
        return response(403);
    });
    assert.equal(await manager.ensureFreshToken(), nextToken());
    assert.equal(store.getItem('refreshToken'), 'refresh-B');
});

test('avisa si un JWT va a caducar y falta el token de renovación', async () => {
    const { manager, store } = create({ token: oldToken() }, () => { throw Error('No llamar'); });
    assert.equal(await manager.ensureFreshToken(), oldToken());
    assert.equal(manager.getStatus(), 'reauth-required');
    assert.equal(store.getItem('token'), oldToken());
});

test('volver a iniciar sesión limpia solo el almacenamiento local y un login nuevo recupera el estado', async () => {
    const { manager, store } = create({ token: oldToken(), refreshToken: 'refresh-A' }, async () => response(403));
    await manager.ensureFreshToken();
    manager.clearSession('reauth');
    assert.equal(store.getItem('token'), null);
    assert.equal(store.getItem('refreshToken'), null);
    manager.login(nextToken(), 'refresh-B');
    assert.equal(manager.getStatus(), 'ok');
    assert.equal(manager.getSessionEndReason(), null);
    assert.equal(store.getItem('refreshToken'), 'refresh-B');
});

test('el 403 tras caducar el token no mantiene acceso inválido', async () => {
    const { manager, store } = create({ token: sign(clock.ms - 1000), refreshToken: 'refresh-A' }, async () => response(403));
    assert.equal(await manager.ensureFreshToken(), null);
    assert.equal(store.getItem('token'), null);
    assert.equal(manager.getSessionEndReason(), 'expired');
});

test('comunica a otras pestañas el motivo de la salida y no pierde la explicación', () => {
    const store = storage({ token: oldToken(), refreshToken: 'refresh-A' });
    const config = { storage: store, fetchImpl: async () => response(503), now: () => clock.ms };
    const first = createSessionManager(config);
    const second = createSessionManager(config);
    first.clearSession('expired');
    let notice;
    second.subscribe(({ reason }) => { notice = reason; });
    second.syncExternalChange();
    assert.equal(notice, 'expired');
    assert.equal(second.getSessionEndReason(), 'expired');
    second.login(nextToken(), 'refresh-B');
    assert.equal(store.getItem('cjmSessionEndReason'), null);
});
