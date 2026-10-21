import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = new URL('../../', import.meta.url);
const source = (path) => readFileSync(new URL(path, here), 'utf8');
const model = source('server/models/Postgres/stock.js');
const baseline = readFileSync(new URL('./fixtures/controlStockLegacySelect.sql.txt', import.meta.url), 'utf8');
const controller = source('server/controllers/stock.js');
const routes = source('server/routes/stock.js');
const hook = source('src/hooks/useStockControl.js');
const autocomplete = source('src/components/stock/StockControlProductSearch.jsx');
const page = source('src/pages/LowStockAlertsPage.jsx');

// Estas pruebas no abren conexiones ni necesitan datos privados de producción.
test('La ruta de sugerencias mantiene el control de permisos de compras', () => {
    assert.match(routes, /get\('\/control-stock\/suggestions', requirePurchasingRole/);
    assert.match(controller, /StockModel\.searchControlStockProducts\(search\)/);
    assert.match(model, /UPPER\(TRIM\(COALESCE\(\$\{alias\}\.obsoleto::text, ''\)\)\) <> 'S'/);
    assert.match(model, /static async searchControlStockProducts\(search = ''\)/);
});

test('Autocompletado limitado y ligero, sólo usa productos vigentes y excluye trabajo', () => {
    const start = model.indexOf('static async searchControlStockProducts');
    const end = model.indexOf('static async getControlStockFilters', start);
    const block = model.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /FROM productos/);
    assert.doesNotMatch(block, /FROM facventa|FROM albcompra_linea|FROM stocklotes/);
    assert.match(block, /AND \$\{controlStockActiveProductCondition\(\)\}/);
    assert.match(block, /NOT ILIKE '%TRABAJO%'/);
    assert.match(block, /LIMIT 10/);
    assert.match(block, /tokens\.join\(''\)\.length < 2/);
});

test('Los filtros de referencia exacta y familia se aplican antes de agregar consumo', () => {
    const q = model.slice(model.indexOf('static async getControlStock({'));
    assert.match(q, /TRIM\(productos\.codprodu::text\) = \$\$\{paramIndex\+\+\}/);
    assert.match(q, /AND \$\{controlStockActiveProductCondition\(\)\}\s*\$\{baseFilters\}/);
    assert.ok(q.indexOf('productos_base AS (') < q.indexOf('consumo_mensual AS ('));
    assert.match(q, /scopeSales = scopedProducts \? `AND EXISTS/);
    assert.match(q, /scopeProviders = scopedProducts \? `AND EXISTS/);
    assert.match(q, /COALESCE\(ultimo_proveedor\.codprove, ''\) = \$\$\{paramIndex\+\+\}/);
});

test('Las fórmulas de planificación y el orden de resultados permanecen idénticos', () => {
    const start = '            SELECT\n                productos_base.codprodu,';
    const stop = '            LIMIT $2';
    const a = baseline.indexOf(start);
    const b = model.indexOf(start, model.indexOf('static async getControlStock({'));
    assert.ok(a >= 0 && b >= 0);
    assert.equal(model.slice(b, model.indexOf(stop, b) + stop.length),
        baseline.slice(a, baseline.indexOf(stop, a) + stop.length));
});

test('Seleccionar una sugerencia consulta por código exacto y preserva filtros restantes', () => {
    assert.match(hook, /const next = \{ \.\.\.filters, productName: String\(code \|\| ''\)\.trim\(\), productCode: String/);
    assert.match(hook, /setAppliedFilters\(next\)/);
    assert.match(hook, /key === 'productName' \? \{ productCode: '' \}/);
    assert.match(autocomplete, /fetchStockControlSuggestions/);
    assert.match(autocomplete, /setTimeout\(\(\) =>/);
    assert.match(autocomplete, /controller\.abort\(\)/);
    assert.match(autocomplete, /ArrowDown/);
    assert.match(autocomplete, /aria-autocomplete="list"/);
});

test('Paginación no altera resumen ni añade únicamente productos de una página', () => {
    assert.match(page, /const pageSize = 40/);
    assert.match(page, /rows\.forEach\(\(product\) =>/);
    assert.match(page, /visibleRows\.filter\(\(product\) => getSuggestedOrder/);
    assert.match(page, /visibleRows\.slice\(/);
    assert.match(page, /rows=\{pageRows\}/);
    assert.match(page, /onClick=\{openPurchasePlan\}/);
});


test('Enter ejecuta el texto actual, sin reutilizar una búsqueda antigua', () => {
    assert.match(autocomplete, /onApply\(search\)/);
    assert.match(hook, /typeof searchOverride === 'string'/);
    assert.match(hook, /productCode: ''/);
});
