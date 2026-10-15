import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const loadPortfolio = (ClienteModel) => {
    const source = read('server/utils/clientPortfolioAccess.js')
        .replace(/^import .*?;\s*$/gm, '')
        .replace(/^export /gm, '');
    return new Function('ClienteModel', `${source}\nreturn { normalizeUserClientAccess, ensureClientAccess };`)(ClienteModel);
};

function fakeResponse() {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    return res;
}

const portfolio = loadPortfolio({
        async userCanAccessClient({ targetCodclien, codrepres, codclien }) {
            if (codrepres === undefined && codclien === undefined) return true;
            return codclien?.includes(targetCodclien) || codrepres?.includes('REP01') && targetCodclien === 'OWN';
        },
});

test('la cartera comercial reúne y deduplica representantes, sin concesión implícita', () => {
    assert.deepEqual(portfolio.normalizeUserClientAccess({ role: 'comercial', codrepre: 'REP01', codrepres: '{REP01,REP02}' }).codrepres, ['REP01', 'REP02']);
    assert.deepEqual(portfolio.normalizeUserClientAccess({ role: 'comercial' }).codrepres, []);
    assert.deepEqual(portfolio.normalizeUserClientAccess({ role: 'administracion' }), { codclien: undefined, codrepres: undefined });
    assert.deepEqual(portfolio.normalizeUserClientAccess({ role: 'comercial', username: 'decoandyou' }).codclien, ['430046019']);
});

test('peticiones por código de cliente ajeno se rechazan antes de consultar datos', async () => {
    const forbidden = fakeResponse();
    assert.equal(await portfolio.ensureClientAccess({ user: { role: 'comercial', codrepre: 'REP01' } }, forbidden, 'OTHER'), false);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.body.error, 'CLIENT_NOT_IN_PORTFOLIO');
    assert.equal(await portfolio.ensureClientAccess({ user: { role: 'comercial', codrepre: 'REP01' } }, fakeResponse(), 'OWN'), true);
});

test('pedidos y albaranes tienen control de cartera en sus controladores', () => {
    assert.match(read('server/controllers/pedventa.js'), /getByClient\(req, res\)[\s\S]*?ensureClientAccess\(req, res, codclien\)/);
    assert.match(read('server/controllers/pedventa.js'), /getClientCodeById\(id\)/);
    assert.match(read('server/controllers/clientPurchases.js'), /getByClient\(req, res\)[\s\S]*?ensureClientAccess\(req, res, codclien\)/);
    assert.match(read('server/controllers/clientPurchases.js'), /getCodesByClient\(req, res\)[\s\S]*?ensureClientAccess\(req, res, codclien\)/);
});

test('la edición toma datos analizados y limita columnas de SQL incluso en el modelo', () => {
    const controller = read('server/controllers/clients.js');
    const model = read('server/models/Postgres/clients.js');
    assert.match(controller, /ClienteModel\.update\(\{ codclien, input: data, allowRepresentativeChange: canReassign \}\)/);
    assert.match(controller, /const data = validationResult\.data/);
    assert.match(model, /keys\.some\(\(key\) => !editable\.has\(key\)\)/);
    assert.match(model, /CLIENT_FIELDS\.filter/);
    assert.match(read('server/schemas/clients.js'), /dadobaja: z\.union\(/);
});

test('búsquedas, contador y orden por pedidos comparten filtros', () => {
    const sql = read('server/models/Postgres/clients.js');
    const controller = read('server/controllers/clients.js');
    assert.match(sql, /const buildClientWhere/);
    assert.match(sql, /buildNormalizedClientSearch\(`\$\{alias\}\.codclien::text`\)/);
    assert.match(sql, /getClientsWithBilling[\s\S]*?buildClientWhere/);
    assert.match(sql, /getCount[\s\S]*?buildClientWhere/);
    assert.match(controller, /res\.json\(\{ clients, total \}\)/);
    assert.match(sql, /v\.estado = 'completada'/);
    assert.match(sql, /AS "ultimaVisita"/);
});

test('el listado y las fichas dejan de descargar pedidos y stock completos', () => {
    const page = read('src/pages/paginaclients.jsx');
    assert.doesNotMatch(page, /\/api\/pedventa\/client/);
    assert.match(page, /Number\(client\.total_billing\)/);
    assert.match(read('src/components/clientes/modal/clientStock.js'), /api\/stock\/client-products/);
    assert.match(read('src/components/clientes/modal/CatalogTab.jsx'), /\/codes`/);
    assert.match(read('server/routes/stock.js'), /client-products.*requireRouteAccess/);
});

test('CSV y descuentos no truncan porcentajes', () => {
    const bought = read('src/components/clientes/modal/PurchasedTab.jsx');
    assert.match(bought, /Exportar CSV/);
    assert.doesNotMatch(bought, /Math\.floor\(d\)/);
    assert.match(bought, /Number\(d\) \/ 100/);
    assert.match(bought, /uFEFF/);
});
