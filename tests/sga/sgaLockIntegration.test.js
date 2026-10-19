import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const picking = readFileSync(new URL('../../src/sga/SgaOrderPicking.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/pages/SgaPage.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../server/index.js', import.meta.url), 'utf8');
const router = readFileSync(new URL('../../server/routes/sgaOrderLocks.js', import.meta.url), 'utf8');
const gateway = readFileSync(new URL('../../src/sga/sgaOrderLockGateway.js', import.meta.url), 'utf8');

test('servidor protege la ruta con autenticación y rol admin', () => {
    assert.match(backend, /app\.use\("\/api\/sga\/order-locks", authMiddleware, createSgaOrderLocksRouter\(\{ pool \}\)\)/);
    assert.match(router, /String\(req\.user\.role\)\.toLowerCase\(\) !== 'admin'/);
});
test('la pantalla recibe el token y debe adquirir antes de comenzar', () => {
    assert.match(page, /<SgaOrderPicking operator=\{activeUser\?\.username\} token=\{token\}/);
    assert.match(picking, /await sgaOrderLockGateway\.claim\(token, key\)/);
    assert.match(picking, /if \(starting\.current \|\| ownedLease\.current\) return/);
});
test('antes de aceptar corte, destino de resto y documento se valida el token', () => {
    assert.match(picking, /const pickCurrent = \(\) => void withVerifiedLease/);
    assert.match(picking, /const confirmRemainder = \(action\) => \{/);
    assert.match(picking, /const createDocument = \(\) => void withVerifiedLease/);
    assert.match(picking, /await sgaOrderLockGateway\.verify/);
});
test('si se pierde la asignación la interfaz no muestra acciones ni documentos', () => {
    assert.match(picking, /\{order && !lease && <section/);
    for (const n of [1,2,3]) assert.ok(picking.includes(`{screen === ${n} && order && lease`));
    assert.match(picking, /const interval = setInterval\(\(\) => void renew\(\), 30000\)/);
});
test('tokens de sesión no quedan almacenados en localStorage, cookies o URL', () => {
    assert.doesNotMatch(gateway, /localStorage|sessionStorage|document\.cookie|URLSearchParams/);
    assert.match(gateway, /Authorization: `Bearer \$\{token\}`/);
    assert.match(router, /router\.post\('\/recover'/);
});
