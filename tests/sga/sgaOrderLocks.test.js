import test from 'node:test';
import assert from 'node:assert/strict';
import { createSgaOrderLockService, normalizeSgaOrderKey, normalizeSgaLeaseToken } from '../../server/services/sgaOrderLocks.js';

// Dobles de PostgreSQL para pruebas unitarias; la consulta ON CONFLICT real es
// la garantía de exclusividad cuando se despliegue contra PostgreSQL.
function mockPool() {
    const locks = new Map();
    const recoveries = [];
    const queries = [];
    let createCalls = 0;
    const pool = {
        locks, recoveries, queries,
        async query(sql, args = []) {
            queries.push({ sql, args });
            if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
                createCalls++;
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes('WITH removed AS')) {
                const [key, user, operator, reason] = args;
                const holder = locks.get(key);
                if (!holder || holder.expiresAt > Date.now()) return { rows: [], rowCount: 0 };
                locks.delete(key);
                recoveries.push({ key, user, operator, reason, previousOperator: holder.operator });
                return { rows: [{ order_key: key }], rowCount: 1 };
            }
            if (sql.includes('INSERT INTO sga_order_leases')) {
                const [key, user, operator, token] = args;
                if (locks.has(key)) return { rows: [], rowCount: 0 };
                const holder = { user, operator, token, expiresAt: Date.now() + 150000 };
                locks.set(key, holder);
                return { rows: [{ order_key: key, operator_name: operator, expires_at: new Date(holder.expiresAt), expired: false }], rowCount: 1 };
            }
            if (sql.includes('UPDATE sga_order_leases')) {
                const [key, user, token] = args;
                const holder = locks.get(key);
                if (!holder || holder.user !== user || holder.token !== token || holder.expiresAt <= Date.now()) return { rows: [], rowCount: 0 };
                holder.expiresAt = Date.now() + 150000;
                return { rows: [{ order_key: key, operator_name: holder.operator, expires_at: new Date(holder.expiresAt), expired: false }], rowCount: 1 };
            }
            if (sql.includes('DELETE FROM sga_order_leases')) {
                const [key, user, token] = args;
                const holder = locks.get(key);
                if (!holder || holder.user !== user || holder.token !== token || holder.expiresAt <= Date.now()) return { rows: [], rowCount: 0 };
                locks.delete(key);
                return { rows: [], rowCount: 1 };
            }
            if (sql.includes('SELECT order_key, operator_name, expires_at')) {
                const key = args[0];
                let entries = key ? (locks.has(key) ? [[key, locks.get(key)]] : []) : [...locks.entries()];
                if (sql.includes('lease_token = $3::uuid')) {
                    entries = entries.filter(([, value]) => value.user === args[1] && value.token === args[2] && value.expiresAt > Date.now());
                }
                return { rows: entries.map(([k, value]) => ({ order_key: k, operator_name: value.operator,
                    expires_at: new Date(value.expiresAt), expired: value.expiresAt <= Date.now() })), rowCount: entries.length };
            }
            throw Error(`SQL no reconocido en prueba: ${sql}`);
        },
        get createCalls() { return createCalls; },
    };
    return pool;
}
const orderKey = '01|A|DEMO-24018';

test('identidad de pedido válida y sin claves ambiguas', () => {
    assert.equal(normalizeSgaOrderKey(' 01|a|demo-24018 '), orderKey);
    for (const invalid of ['', '123', 'A|B', '||', 'a|b|;drop table', 'x'.repeat(185)]) assert.equal(normalizeSgaOrderKey(invalid), null);
});
test('solo tokens UUID sirven para renovar/liberar la misma sesión', () => {
    assert.equal(normalizeSgaLeaseToken('prueba'), null);
    assert.ok(normalizeSgaLeaseToken('ec2c1003-5b50-4a86-9b5e-10fe4ece6712'));
});
test('dos operarios compitiendo por el mismo pedido: solo uno lo obtiene', async () => {
    const pool = mockPool(), service = createSgaOrderLockService(pool);
    const [a, b] = await Promise.all([
        service.acquire({ orderKey, userId: '1', operator: 'Juan' }),
        service.acquire({ orderKey, userId: '2', operator: 'Ana' }),
    ]);
    assert.equal(Number(a.ok) + Number(b.ok), 1);
    assert.equal((await service.list()).length, 1);
    assert.equal(pool.createCalls, 2);
    assert.match(pool.queries.find((x) => x.sql.includes('INSERT INTO sga_order_leases')).sql, /ON CONFLICT \(order_key\) DO NOTHING/);
});
test('el mismo administrador en dos tablets diferentes no puede duplicar pedido', async () => {
    const service = createSgaOrderLockService(mockPool());
    const first = await service.acquire({ orderKey, userId: '1', operator: 'Admin' });
    const second = await service.acquire({ orderKey, userId: '1', operator: 'Admin' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.holder.operator, 'Admin');
});
test('sesión con token equivocado no puede renovar ni liberar ni verificar', async () => {
    const service = createSgaOrderLockService(mockPool());
    const first = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    const token = 'ec2c1003-5b50-4a86-9b5e-10fe4ece6712';
    assert.equal((await service.renew({ orderKey, userId: '2', token: first.token })).ok, false);
    assert.equal((await service.verify({ orderKey, userId: '1', token })).ok, false);
    assert.equal(await service.release({ orderKey, userId: '1', token }), false);
    assert.equal((await service.verify({ orderKey, userId: '1', token: first.token })).ok, true);
});
test('la renovación mantiene el bloqueo y salir lo libera', async () => {
    const service = createSgaOrderLockService(mockPool());
    const first = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    assert.equal((await service.renew({ orderKey, userId: '1', token: first.token })).ok, true);
    assert.equal((await service.acquire({ orderKey, userId: '2', operator: 'Ana' })).ok, false);
    assert.equal(await service.release({ orderKey, userId: '1', token: first.token }), true);
    assert.equal((await service.acquire({ orderKey, userId: '2', operator: 'Ana' })).ok, true);
});
test('si caduca la sesión, la tablet antigua NO puede renovar ni terminar', async () => {
    const pool = mockPool(), service = createSgaOrderLockService(pool);
    const first = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    pool.locks.get(orderKey).expiresAt = Date.now() - 1000;
    assert.equal((await service.verify({ orderKey, userId: '1', token: first.token })).ok, false);
    assert.equal((await service.renew({ orderKey, userId: '1', token: first.token })).ok, false);
});
test('un pedido caducado NO se reasigna automáticamente: requiere comprobar cortes físicos', async () => {
    const pool = mockPool(), service = createSgaOrderLockService(pool);
    await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    pool.locks.get(orderKey).expiresAt = Date.now() - 1000;
    const second = await service.acquire({ orderKey, userId: '2', operator: 'Ana' });
    assert.equal(second.ok, false);
    assert.equal(second.holder.status, 'revision_necesaria');
    assert.equal((await service.list())[0].status, 'revision_necesaria');
});
test('recuperación requiere caducidad y deja rastro del motivo', async () => {
    const pool = mockPool(), service = createSgaOrderLockService(pool);
    await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    assert.equal((await service.recover({ orderKey, userId: '2', operator: 'Ana', reason: 'Piezas cotejadas físicamente' })).ok, false);
    pool.locks.get(orderKey).expiresAt = Date.now() - 1000;
    assert.equal((await service.recover({ orderKey, userId: '2', operator: 'Ana', reason: 'Piezas cotejadas físicamente' })).ok, true);
    assert.equal(pool.recoveries.length, 1);
    assert.equal(pool.recoveries[0].previousOperator, 'Juan');
    assert.equal((await service.acquire({ orderKey, userId: '2', operator: 'Ana' })).ok, true);
});
test('petición obsoleta no puede liberar el bloqueo nuevo', async () => {
    const service = createSgaOrderLockService(mockPool());
    const old = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    await service.release({ orderKey, userId: '1', token: old.token });
    const newer = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    assert.notEqual(newer.token, old.token);
    assert.equal(await service.release({ orderKey, userId: '1', token: old.token }), false);
    assert.equal((await service.verify({ orderKey, userId: '1', token: newer.token })).ok, true);
});

test('una tablet caducada no puede liberar el pedido saltándose la revisión física', async () => {
    const pool = mockPool(), service = createSgaOrderLockService(pool);
    const first = await service.acquire({ orderKey, userId: '1', operator: 'Juan' });
    pool.locks.get(orderKey).expiresAt = Date.now() - 1000;
    assert.equal(await service.release({ orderKey, userId: '1', token: first.token }), false);
    assert.equal((await service.acquire({ orderKey, userId: '2', operator: 'Ana' })).ok, false);
});
