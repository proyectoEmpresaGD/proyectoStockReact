import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userCanAccessRoute, getRoleDefinitions } from '../../src/utils/roleAccessConfig.js';
import { requireRouteAccess, requireAnyRouteAccess } from '../../server/middlewares/requireRouteAccess.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const modules = [
    ['/clients', ['comercial', 'administracion', 'decoandyou']],
    ['/reservasTejido', ['ventas', 'administracion', 'administrativo', 'almacen', 'compras']],
    ['/agenda', ['comercial', 'administracion']],
    ['/notas', ['comercial', 'administracion']],
    ['/stock-alerts', ['compras']],
    ['/equivalencias', ['almacen', 'compras']],
    ['/analitica-facturacion', ['administracion', 'administrativo']],
    ['/mapas-facturacion', ['administracion']],
    ['/libro', ['almacen', 'compras', 'user', 'administracion']],
    ['/stock', ['almacen', 'compras', 'ventas', 'user', 'comercial', 'administracion', 'decoandyou']],
];

function run(middleware, user) {
    const reply = { statusCode: 200, body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    let passed = false;
    middleware({ user }, reply, () => { passed = true; });
    return { passed, status: reply.statusCode };
}

test('Matriz de roles predeterminados: frontend/backend coinciden en accesos por módulo', () => {
    const roles = Object.keys(getRoleDefinitions());
    for (const [path, allowed] of modules) {
        for (const role of roles) {
            const uiAllowed = userCanAccessRoute(role, path);
            const apiAllowed = run(requireRouteAccess(path, ...allowed), { role }).passed;
            assert.equal(apiAllowed, uiAllowed, `Módulo ${path}, rol ${role}`);
        }
    }
});

test('Permisos individuales: allow y deny tienen la misma prioridad en frontend y API', () => {
    for (const [path, allowed] of modules) {
        const hasAccess = requireRouteAccess(path, ...allowed);
        for (const role of ['ventas', 'almacen', 'comercial', 'administracion', 'user']) {
            const denied = { role, route_access: { [path]: 'deny' } };
            const granted = { role, route_access: { [path]: 'allow' } };
            assert.equal(run(hasAccess, denied).passed, userCanAccessRoute(role, path, denied.route_access), `${path} ${role} deny`);
            assert.equal(run(hasAccess, granted).passed, userCanAccessRoute(role, path, granted.route_access), `${path} ${role} allow`);
        }
    }
});

test('Roles personalizados: servidor admite las rutas configuradas en ROLE_DEFINITIONS_JSON', () => {
    const previous = process.env.ROLE_DEFINITIONS_JSON;
    const role = 'control_interno';
    try {
        process.env.ROLE_DEFINITIONS_JSON = JSON.stringify({
            [role]: { routes: ['/clients', '/reservasTejido'], permissions: ['sales.read'] },
        });
        const user = { role };
        assert.equal(run(requireRouteAccess('/clients', 'comercial'), user).passed, true);
        assert.equal(run(requireRouteAccess('/reservasTejido', 'ventas'), user).passed, true);
        assert.equal(run(requireRouteAccess('/agenda', 'comercial'), user).status, 403);
        assert.equal(run(requireRouteAccess('/clients', 'comercial'), {
            role, route_access: { '/clients': 'deny' },
        }).status, 403);
    } finally {
        if (previous === undefined) delete process.env.ROLE_DEFINITIONS_JSON;
        else process.env.ROLE_DEFINITIONS_JSON = previous;
    }
});

test('Roles no definidos: el frontend no muestra pantallas sin permiso y el backend tampoco', () => {
    const role = 'rol_sin_configurar_x_test';
    assert.equal(userCanAccessRoute(role, '/clients'), false);
    assert.equal(userCanAccessRoute(role, '/reservasTejido'), false);
    assert.equal(run(requireRouteAccess('/clients', 'comercial'), { role }).status, 403);
    const override = { '/reservasTejido': 'allow' };
    assert.equal(userCanAccessRoute(role, '/reservasTejido', override), true);
    assert.equal(run(requireRouteAccess('/reservasTejido', 'ventas'), { role, route_access: override }).passed, true);
});

test('Búsqueda comercial no desbloquea Gestión de clientes ni operaciones de otros módulos', () => {
    assert.equal(run(requireRouteAccess('/reservasTejido', 'ventas'), { role: 'ventas' }).passed, true);
    assert.equal(run(requireRouteAccess('/clients', 'comercial'), { role: 'ventas' }).status, 403);
    const shared = requireAnyRouteAccess(['/clients', 'comercial'], ['/entradas', 'ventas']);
    assert.equal(run(shared, { role: 'ventas' }).passed, true);
    assert.equal(run(shared, { role: 'ventas', route_access: { '/entradas': 'deny' } }).status, 403);
});

test('Reservas aplica el control de acceso antes de GET, POST, PATCH y DELETE', () => {
    const routes = read('server/routes/reservas.js');
    const guard = routes.indexOf('reservasRouter.use(requireRouteAccess(');
    assert.ok(guard > 0);
    for (const statement of [
        "reservasRouter.get('/clientes/search'", "reservasRouter.get('/'",
        "reservasRouter.post('/'", "reservasRouter.get('/:idreserva'",
        "reservasRouter.patch('/:idreserva'", "reservasRouter.delete('/:idreserva'",
    ]) {
        assert.ok(routes.indexOf(statement) > guard, `Sin middleware: ${statement}`);
    }
});

test('La sincronización de permisos no debe pisar una sesión cerrada y refresca la vista', () => {
    const source = read('src/Auth/AuthContext.jsx');
    assert.match(source, /setUser\(\(current\) => current && \{ \.\.\.current \}\)/);
    assert.match(source, /controller\.abort\(\)/);
    assert.match(source, /if \(!active \|\| !profile\) return/);
    assert.match(source, /setRoleCatalogLoading\(false\)/);
    const protectedRoute = read('src/Auth/ProtectedRoute.jsx');
    assert.match(protectedRoute, /roleCatalogLoading && !getRoleDefinition\(normalizedRole\)/);
});
