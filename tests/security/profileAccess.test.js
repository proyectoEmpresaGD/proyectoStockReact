import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    AVAILABLE_ROUTES,
    getFirstAccessibleRoute,
    userCanAccessRoute,
} from '../../src/utils/roleAccessConfig.js';

const root = new URL('../../', import.meta.url);
const file = (path) => readFileSync(new URL(path, root), 'utf8');

test('Mi perfil es accesible para todos los roles reconocidos y personalizados', () => {
    for (const role of ['admin', 'comercial', 'almacen', 'compras', 'ventas', 'user', 'rrhh', 'administracion', 'administrativo', 'perfil_nuevo']) {
        assert.equal(userCanAccessRoute(role, '/perfilusuario'), true, role);
        assert.equal(userCanAccessRoute(role, '/perfilusuario/'), true, role);
    }
});

test('Las denegaciones antiguas, incluido un deny global, no bloquean el perfil propio', () => {
    assert.equal(userCanAccessRoute('ventas', '/perfilusuario', { '/perfilusuario': 'deny' }), true);
    assert.equal(userCanAccessRoute('ventas', '/perfilusuario', { '/': 'deny' }), true);
    assert.equal(userCanAccessRoute('rol_nuevo', '/perfilusuario', { '/perfilusuario': 'deny' }), true);
});

test('No se abren permisos de otros módulos ni se concede acceso sin rol', () => {
    assert.equal(userCanAccessRoute('ventas', '/clients'), false);
    assert.equal(userCanAccessRoute('ventas', '/stock', { '/stock': 'deny' }), false);
    assert.equal(userCanAccessRoute('rol_nuevo', '/analitica-facturacion'), false);
    assert.equal(userCanAccessRoute('', '/perfilusuario'), false);
});

test('El perfil no puede ocultarse desde el editor de permisos', () => {
    const definition = AVAILABLE_ROUTES.find(({path}) => path === '/perfilusuario');
    assert.equal(definition.individualAccess, false);
    assert.equal(definition.showInPermissionEditor, false);
    assert.equal(getFirstAccessibleRoute('rol_nuevo'), '/perfilusuario');
});

test('La protección del perfil exige token, pero no espera catálogo de roles', () => {
    const guard = file('src/Auth/ProtectedRoute.jsx');
    const noToken = guard.indexOf('if (!token) {');
    const personal = guard.indexOf('if (isOwnProfileRoute && !requiredRole');
    const roleCheck = guard.indexOf('if (roleCatalogLoading && !getRoleDefinition');
    assert.ok(noToken >= 0 && personal > noToken && roleCheck > personal);
    assert.match(guard, /return children;/);
    const api = file('server/routes/auth.js');
    assert.match(api, /authRouter\.get\('\/me', authMiddleware, AuthController\.getPerfilUsuario\)/);
});
