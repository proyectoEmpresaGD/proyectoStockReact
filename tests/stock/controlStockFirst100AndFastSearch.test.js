import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const hook = read('src/hooks/useStockControl.js');
const filters = read('src/components/stock/StockControlFilters.jsx');
const page = read('src/pages/LowStockAlertsPage.jsx');
const model = read('server/models/Postgres/stock.js');
const controller = read('server/controllers/stock.js');
const routes = read('server/routes/stock.js');

test('La primera carga y el reset piden 100 resultados; 500/1000/2000 siguen disponibles', () => {
    assert.match(hook, /const DEFAULT_FILTERS = \{[\s\S]*?limit: '100'/);
    assert.match(hook, /setFilters\(DEFAULT_FILTERS\)/);
    assert.match(hook, /setAppliedFilters\(DEFAULT_FILTERS\)/);
    assert.match(filters, /value: '100'/);
    for (const limit of ['500', '1000', '2000']) assert.match(filters, new RegExp(`value: '${limit}'`));
    assert.match(controller, /monthsBack = 12, limit = 100/);
    assert.match(model, /Math\.min\(Math\.max\(Number\.parseInt\(limit, 10\) \|\| 500, 1\), 2000\)/);
    assert.match(page, /La planificación muestra como máximo \{appliedFilters\.limit\}/);
});

test('El autocompletado sigue buscando fuera de las primeras 100 referencias y conserva los permisos', () => {
    const suggestions = read('src/components/stock/StockControlProductSearch.jsx');
    assert.match(suggestions, /fetchStockControlSuggestions\(\{ token, query: search, signal:/);
    assert.match(suggestions, /controller\.abort\(\)/);
    assert.match(hook, /provider: '', collection: '', productName: String\(code/);
    assert.match(routes, /get\('\/control-stock\/suggestions', requirePurchasingRole/);
    assert.match(routes, /get\('\/control-stock', requirePurchasingRole/);
});

test('Las sugerencias priorizan código exacto, prefijo y después descripciones', async () => {
    const begin = model.indexOf('static async searchControlStockProducts(');
    const end = model.indexOf('static async getControlStockFilters', begin);
    const method = model.slice(begin, end);
    const calls = [];
    const Pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    const make = new Function('pool', 'controlStockActiveProductCondition', `return class Mock { ${method} }`);
    const Model = make(Pool, () => "UPPER(TRIM(COALESCE(productos.obsoleto::text, ''))) <> 'S'");
    await Model.searchControlStockProducts('ARE012');
    assert.deepEqual(calls[0].params, ['%ARE012%', 'ARE012%']);
    assert.match(calls[0].sql, /WHEN UPPER\(TRIM\(productos\.codprodu::text\)\) = UPPER\(LEFT/);
    assert.match(calls[0].sql, /WHEN TRIM\(productos\.codprodu::text\) ILIKE/);
    assert.match(calls[0].sql, /WHEN productos\.desprodu ILIKE/);
    await Model.searchControlStockProducts('ABC_50%');
    assert.deepEqual(calls[1].params, ['%ABC\\_50\\%%', 'ABC\\_50\\%%']);
});

test('Una búsqueda por referencia reduce las líneas de venta antes de los joins históricos sin duplicarlas', () => {
    const start = model.indexOf('static async getControlStock({');
    const sqlCode = model.slice(start, model.indexOf('static async getById(', start));
    assert.match(sqlCode, /lineas_venta_filtradas AS MATERIALIZED/);
    assert.match(sqlCode, /SELECT albventa_linea\.codprodu, albventa_linea\.cantidad,/);
    assert.match(sqlCode, /\$\{scopeSales\}/);
    assert.match(sqlCode, /salesLinesSource = explicitProductSearch \? 'lineas_venta_filtradas AS albventa_linea' : 'albventa_linea'/);
    assert.match(sqlCode, /INNER JOIN \$\{salesLinesSource\}/);
    assert.match(sqlCode, /const scopeSales = scopedProducts \? `AND EXISTS/);
    assert.match(sqlCode, /LIMIT \$2/);
});
