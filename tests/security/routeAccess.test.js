import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRouteAccess, requireAnyRouteAccess } from '../../server/middlewares/requireRouteAccess.js';

function check(middleware, user) {
    let status = null;
    let passed = false;
    const res = {
        status(code) { status = code; return this; },
        json(payload) { return payload; },
    };
    middleware({ user }, res, () => { passed = true; });
    return { passed, status };
}

test('una ruta comercial no acepta usuarios sin permiso', () => {
    const access = requireRouteAccess('/clients', 'comercial', 'administracion', 'decoandyou');
    assert.deepEqual(check(access, undefined), { passed: false, status: 401 });
    assert.deepEqual(check(access, { role: 'almacen' }), { passed: false, status: 403 });
    assert.equal(check(access, { role: 'comercial' }).passed, true);
    assert.equal(check(access, { role: 'decoandyou' }).passed, true);
    assert.equal(check(access, { role: 'admin' }).passed, true);
});

test('el permiso individual permite y deniega, incluso si el rol coincide', () => {
    const access = requireRouteAccess('/clients', 'comercial', 'administracion');
    assert.equal(check(access, { role: 'user', route_access: { '/clients': 'allow' } }).passed, true);
    assert.deepEqual(check(access, { role: 'comercial', route_access: { '/clients': 'deny' } }),
        { passed: false, status: 403 });
});

test('los mapas se protegen independientemente de clientes', () => {
    const map = requireRouteAccess('/mapas-facturacion', 'administracion');
    assert.equal(check(map, { role: 'comercial' }).status, 403);
    assert.equal(check(map, { role: 'administracion' }).passed, true);
    assert.equal(check(map, { role: 'comercial', route_access: { '/mapas-facturacion': 'allow' } }).passed, true);
    assert.equal(check(map, { role: 'administracion', route_access: { '/mapas-facturacion': 'deny' } }).status, 403);
});

test('pedidos permite lectura desde módulos distintos sin permitir otros roles', () => {
    const orders = requireAnyRouteAccess(
        ['/clients', 'comercial', 'administracion', 'decoandyou'],
        ['/entradas', 'ventas'],
        ['/analitica-facturacion', 'administracion', 'administrativo']
    );
    assert.equal(check(orders, { role: 'ventas' }).passed, true);
    assert.equal(check(orders, { role: 'administrativo' }).passed, true);
    assert.equal(check(orders, { role: 'user' }).status, 403);
    assert.equal(check(orders, { role: 'ventas', route_access: { '/entradas': 'deny' } }).status, 403);
});
