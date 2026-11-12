import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canViewClientHInvoices } from '../../server/utils/clientInvoiceSeriesAccess.js';

const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const accessSource = read('server/utils/clientPortfolioAccess.js')
    .replace(/^import .*?;\s*$/gm, '')
    .replace(/^export /gm, '');
const portfolio = new Function('ClienteModel', `${accessSource}\nreturn { normalizeUserClientAccess, resolveClientDirectoryAccess, ensureClientAccess };`)({});

function createController(model) {
    const source = read('server/controllers/clients.js')
        .replace(/^import .*?;\s*$/gm, '')
        .replace('export class ClienteController', 'class ClienteController');
    return new Function('ClienteModel', 'normalizeUserClientAccess', 'resolveClientDirectoryAccess', 'ensureClientAccess', 'canViewClientHInvoices',
        `${source}\nreturn new ClienteController();`)(
        model, portfolio.normalizeUserClientAccess, portfolio.resolveClientDirectoryAccess, portfolio.ensureClientAccess, canViewClientHInvoices,
    );
}

function response() {
    return { statusCode: 200, body: undefined, status(n) { this.statusCode = n; return this; }, json(obj) { this.body = obj; return this; } };
}

const manager = { role: 'comercial', username: 'CARLOS', codrepre: '020', codrepres: ['021', '022', '020'] };

test('vista equipo mantiene códigos propios y los representantes autorizados', () => {
    assert.deepEqual(portfolio.resolveClientDirectoryAccess(manager, undefined).codrepres, ['020', '021', '022']);
    assert.deepEqual(portfolio.resolveClientDirectoryAccess(manager, 'equipo').codrepres, ['020', '021', '022']);
    assert.deepEqual(portfolio.resolveClientDirectoryAccess(manager, 'propia').codrepres, ['020']);
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ ...manager, codrepres: '{021,022}' }, 'propia').codrepres, ['020']);
});

test('sin código propio no se abre ninguna cartera; un usuario sin equipo ve su cartera habitual', () => {
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ role: 'comercial', codrepres: ['021'] }, 'propia').codrepres, []);
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ role: 'ventas', codrepre: '030' }, 'propia').codrepres, ['030']);
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ role: 'comercial', codrepre: '050' }, 'equipo').codrepres, ['050']);
});

test('el filtro no cambia privilegios administrativos ni excepciones de cartera', () => {
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ role: 'admin' }, 'propia'), { codclien: undefined, codrepres: undefined });
    assert.deepEqual(portfolio.resolveClientDirectoryAccess({ role: 'comercial', username: 'DECOANDYOU', codrepre: '020', codrepres: ['021'] }, 'propia'), {
        codclien: ['430046019'], codrepres: undefined,
    });
    assert.deepEqual(portfolio.resolveClientDirectoryAccess(manager, 'propia').codrepres, ['020']);
    assert.deepEqual(portfolio.normalizeUserClientAccess(manager).codrepres, ['020', '021', '022']);
});

test('backend aplica el filtro a listado y recuento, búsquedas, provincia y ordenación por importe', async () => {
    const queries = [];
    const model = {
        getAll: async (args) => { queries.push(['getAll', args]); return [{ codclien: '1' }]; },
        getCount: async (args) => { queries.push(['getCount', args]); return 1; },
        search: async (args) => { queries.push(['search', args]); return []; },
        getByProvince: async (args) => { queries.push(['province', args]); return []; },
        getClientsWithBilling: async (args) => { queries.push(['billing', args]); return []; },
    };
    const controller = createController(model);
    const req = { user: manager, query: { cartera: 'propia', page: '1', limit: '10', query: 'A' }, params: { codprovi: '28' } };
    const list = response();
    await controller.getAll(req, list);
    assert.deepEqual(list.body, { clients: [{ codclien: '1' }], total: 1 });
    await controller.search(req, response());
    await controller.getByProvince(req, response());
    await controller.getClientsWithBilling(req, response());
    assert.deepEqual(queries.map(([name]) => name), ['getAll', 'getCount', 'search', 'province', 'billing', 'getCount']);
    for (const [name, args] of queries) {
        assert.deepEqual(args.codrepres, ['020'], `${name} debe limitarse al representante propio`);
        assert.equal(args.codclien, undefined);
    }
    queries.length = 0;
    await controller.getAll({ ...req, query: { page: '1', limit: '10' } }, response());
    assert.deepEqual(queries[0][1].codrepres, ['020', '021', '022']);
});

test('el navegador añade el modo propio a la consulta y sugerencias sin afectar Reservas', () => {
    const page = read('src/pages/paginaclients.jsx');
    const search = read('src/components/clientes/SearchBarClients.jsx');
    assert.match(page, /if \(portfolioView === 'propia'\) url \+= '&cartera=propia'/);
    assert.match(page, /aria-pressed=\{portfolioView === 'propia'\}/);
    assert.match(page, /Solo mis clientes/);
    assert.match(page, /setCurrentPage\(1\)/);
    assert.match(search, /else if \(portfolioView === 'propia'\) params\.set\('cartera', 'propia'\)/);
    assert.match(search, /suggestionAbortRef\.current\?\.abort\(\);[\s\S]*?setSuggestions\(\[\]\);/);
});
