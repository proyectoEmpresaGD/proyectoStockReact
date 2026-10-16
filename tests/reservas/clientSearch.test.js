import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireRouteAccess } from '../../server/middlewares/requireRouteAccess.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

// El controlador se evalúa con modelos falsos para probar la lógica sin credenciales ni BD.
const loadController = (ClienteModel) => {
    const source = read('server/controllers/reservas.js')
        .replace(/^import .*?;\s*$/gm, '')
        .replace('export class ReservasController', 'class ReservasController');
    const Controller = new Function('ReservasModel', 'ClienteModel', `${source}\nreturn ReservasController;`)(
        {}, ClienteModel
    );
    return new Controller();
};

const fakeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
});

const canSearchForReservations = requireRouteAccess(
    '/reservasTejido', 'ventas', 'administracion', 'administrativo', 'almacen', 'compras'
);
const canAccessClientRecords = requireRouteAccess('/clients', 'comercial', 'administracion', 'decoandyou');

function checkPermission(middleware, user) {
    const response = fakeResponse();
    let nextCalled = false;
    middleware({ user }, response, () => { nextCalled = true; });
    return { allowed: nextCalled, status: response.statusCode };
}

test('Ventas busca clientes en Reservas pero no adquiere acceso a Gestión de clientes', () => {
    const user = { role: 'ventas', username: 'VENTAS1' };
    assert.equal(checkPermission(canSearchForReservations, user).allowed, true);
    assert.deepEqual(checkPermission(canAccessClientRecords, user), { allowed: false, status: 403 });
});

test('Se respetan permisos individuales, incluida denegación expresa a Reservas', () => {
    assert.equal(checkPermission(canSearchForReservations, { role: 'ventas', route_access: { '/reservasTejido': 'deny' } }).status, 403);
    assert.equal(checkPermission(canSearchForReservations, { role: 'user', route_access: { '/reservasTejido': 'allow' } }).allowed, true);
    assert.equal(checkPermission(canSearchForReservations, { role: 'user' }).status, 403);
    assert.equal(checkPermission(canSearchForReservations, null).status, 401);
});

test('La búsqueda de Reservas no filtra por comercial y solo devuelve los campos del modelo de sugerencias', async () => {
    const queries = [];
    const expected = [{ codclien: '0009', razclien: 'CLIENTE DE OTRO REPRESENTANTE', localidad: 'Madrid', codpais: 'ES' }];
    const controller = loadController({
        async search(args) { queries.push(args); return expected; },
    });
    const response = fakeResponse();
    await controller.searchClientes({ query: { query: 'otro', limit: '500' }, user: { role: 'ventas' } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, expected);
    assert.deepEqual(queries, [{ query: 'otro', limit: 50 }]);
    assert.equal(Object.hasOwn(queries[0], 'codrepres'), false);
    assert.equal(Object.hasOwn(queries[0], 'codclien'), false);
});

test('Búsquedas vacías o sin letras no enumeran clientes', async () => {
    let calls = 0;
    const controller = loadController({ async search() { calls++; return []; } });
    for (const query of ['', ' ', '..', 'A']) {
        const response = fakeResponse();
        await controller.searchClientes({ query: { query } }, response);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, []);
    }
    assert.equal(calls, 0);
});

test('Rutas separadas y selector apuntan al endpoint de Reservas', () => {
    const routes = read('server/routes/reservas.js');
    const searchBar = read('src/components/clientes/SearchBarClients.jsx');
    const reservaPage = read('src/pages/reservas.jsx');
    assert.ok(routes.indexOf("'/clientes/search'") < routes.indexOf("'/:idreserva'"));
    assert.match(routes, /reservasRouter\.use\(requireRouteAccess\(/);
    assert.match(routes, /'\/reservasTejido', 'ventas'/);
    assert.ok(routes.indexOf('reservasRouter.use(') < routes.indexOf("reservasRouter.get('/clientes/search'"));
    assert.match(searchBar, /searchScope === 'reservas'/);
    assert.match(searchBar, /\/api\/reservas\/clientes\/search/);
    assert.match(searchBar, /\/api\/clients\/search/);
    assert.match(reservaPage, /searchScope="reservas"/);
    assert.match(read('server/models/Postgres/clients.js'), /COALESCE\(UPPER\(TRIM\(\$\{alias\}\.dadobaja::text\)\), ''\) <> 'S'/);
});
