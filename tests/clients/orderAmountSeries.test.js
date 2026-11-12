import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buildOrderHInvoiceExclusionSql,
    buildClientHInvoiceVisibilitySql,
    CLIENT_H_INVOICE_CUTOFF_DATE,
    canViewClientHInvoices,
} from '../../server/utils/clientInvoiceSeriesAccess.js';

function model(relative, className, pool, extras = {}) {
    const file = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    const at = className === 'ClienteModel' ? 'const buildNormalizedClientSearch =' : `export class ${className}`;
    const source = file.slice(file.indexOf(at)).replace(`export class ${className}`, `class ${className}`);
    const bindings = { pool, CLIENT_FIELDS: [], buildOrderHInvoiceExclusionSql, ...extras };
    return new Function(...Object.keys(bindings), `${source}\nreturn ${className}`)(...Object.values(bindings));
}

function capturePool() {
    const queries = [];
    return { queries, async query(sql, params) { queries.push({ sql, params }); return { rows: [] }; } };
}

function response() {
    return {
        statusCode: 200, body: null, headers: {},
        setHeader(key, value) { this.headers[key] = value; return this; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; },
    };
}

function controller(relative, className, models) {
    const file = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    const source = file.slice(file.indexOf(`export class ${className}`)).replace(`export class ${className}`, `class ${className}`);
    const imports = { ...models, canViewClientHInvoices, ensureClientAccess: async () => true, resolveClientDirectoryAccess: () => ({}) };
    return new Function(...Object.keys(imports), `${source}\nreturn new ${className}()`)(...Object.values(imports));
}

test('el filtro se basa en la serie de FACTURA H/HH y enlaza la línea de pedido, nunca confunde la serie del pedido', () => {
    const sql = buildOrderHInvoiceExclusionSql('p');
    assert.match(sql, /av\.codserfacventa::text/);
    assert.match(sql, /AND NOT \(UPPER/);
    assert.match(sql, /fv_historica\.fecha::date < DATE '2026-11-12'/);
    assert.equal(CLIENT_H_INVOICE_CUTOFF_DATE, '2026-11-12');
    assert.match(sql, /IN \('H', 'HH'\)/);
    for (const name of ['codclien', 'codserpedventa', 'npedventa']) {
        assert.match(sql, new RegExp(`avl\\.${name}`));
    }
    assert.match(sql, /avl\.nrbpedvenlinea::text/);
    assert.match(sql, /avl\.canal::text/);
    assert.match(sql, /p\.linea::text/);
    assert.match(sql, /NOT EXISTS/); // Sin multiplicar importes por varios albaranes
    assert.doesNotMatch(sql, /p\.codserpedventa::text.*IN \('H', 'HH'\)/);
    assert.throws(() => buildOrderHInvoiceExclusionSql('p;DROP TABLE clientes'), /no válido/);
});

test('importe por cliente: oculto filtra las facturas H/HH y autorizado mantiene el SQL de pedidos original', async () => {
    const pool = capturePool();
    const PedVentaModel = model('server/models/Postgres/pedventa.js', 'PedVentaModel', pool);
    await PedVentaModel.getByClient({ codclien: 'C1', ejercicio: '2026' });
    assert.match(pool.queries[0].sql, /NOT EXISTS[\s\S]*av\.codserfacventa::text/);
    assert.deepEqual(pool.queries[0].params, ['C1', '2026']);
    await PedVentaModel.getByClient({ codclien: 'C1', canViewHInvoices: true });
    assert.doesNotMatch(pool.queries[1].sql, /albventa_linea|NOT EXISTS/);
    assert.deepEqual(pool.queries[1].params, ['C1']);
});

test('ordenar clientes por importe usa el mismo filtro H/HH para no desordenar los importes visibles', async () => {
    const pool = capturePool();
    const ClienteModel = model('server/models/Postgres/clients.js', 'ClienteModel', pool);
    const args = { limit: 10, offset: 0, codrepres: ['REP01'] };
    await ClienteModel.getClientsWithBilling(args);
    assert.match(pool.queries[0].sql, /LEFT JOIN pedventa p[\s\S]*AND NOT EXISTS[\s\S]*av\.codserfacventa::text/);
    assert.match(pool.queries[0].sql, /ORDER BY total_billing DESC/);
    assert.deepEqual(pool.queries[0].params, [['REP01'], 10, 0]);
    await ClienteModel.getClientsWithBilling({ ...args, canViewHInvoices: true });
    assert.doesNotMatch(pool.queries[1].sql, /albventa_linea|NOT EXISTS/);
    assert.deepEqual(pool.queries[1].params, [['REP01'], 10, 0]);
});

test('el backend calcula el permiso desde req.user tanto para el importe como para la ordenación', async () => {
    const orderCalls = [];
    const rankCalls = [];
    const sales = controller('server/controllers/pedventa.js', 'PedVentaController', {
        PedVentaModel: { async getByClient(args) { orderCalls.push(args); return []; } },
    });
    const directory = controller('server/controllers/clients.js', 'ClienteController', {
        ClienteModel: {
            async getClientsWithBilling(args) { rankCalls.push(args); return []; },
            async getCount() { return 0; },
        },
    });
    const req = {
        user: { role: 'comercial', route_access: { '/clients/series-h-hh': 'hidden' } },
        params: { codclien: 'C1' },
        query: { page: '1', canViewHInvoices: 'true', cartera: 'equipo' },
    };
    await sales.getByClient(req, response());
    await directory.getClientsWithBilling(req, response());
    assert.equal(orderCalls[0].canViewHInvoices, false);
    assert.equal(rankCalls[0].canViewHInvoices, false);
    assert.equal(orderCalls[0].codclien, 'C1');
    req.user.route_access['/clients/series-h-hh'] = 'allow';
    await sales.getByClient(req, response());
    await directory.getClientsWithBilling(req, response());
    assert.equal(orderCalls[1].canViewHInvoices, true);
    assert.equal(rankCalls[1].canViewHInvoices, true);
    req.user = { role: 'admin' };
    await sales.getByClient(req, response());
    await directory.getClientsWithBilling(req, response());
    assert.equal(orderCalls[2].canViewHInvoices, true);
    assert.equal(rankCalls[2].canViewHInvoices, true);
});


test('importe de pedidos: el corte usa fecha real de factura; el SQL sin permiso excluye solo H/HH nuevas', () => {
    const sql = buildOrderHInvoiceExclusionSql('p');
    assert.match(sql, /NOT EXISTS/);
    assert.match(sql, /AND NOT \(UPPER/);
    assert.match(sql, /OR EXISTS \(\s*SELECT 1\s*FROM facventa fv_historica/);
    assert.match(sql, /fv_historica\.fecha::date < DATE '2026-11-12'/);
    assert.doesNotMatch(sql, /av\.fecha::date/);
    assert.doesNotMatch(sql, /p\.fecha::date/);
    assert.equal(buildClientHInvoiceVisibilitySql('av').includes("DATE '2026-11-12'"), true);
});
