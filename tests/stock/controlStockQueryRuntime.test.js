import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../server/models/Postgres/stock.js', import.meta.url), 'utf8');
const isolateMethod = (start, end) => {
    const begin = source.indexOf(`    static async ${start}`);
    const finish = source.indexOf(`    static async ${end}`, begin);
    assert.ok(begin >= 0 && finish > begin);
    return source.slice(begin, finish);
};

const buildMockedModel = (method) => {
    const calls = [];
    const pool = { query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
    } };
    const condition = (alias = 'productos') => `UPPER(TRIM(COALESCE(${alias}.obsoleto::text, ''))) <> 'S'`;
    const constructor = new Function('pool', 'controlStockActiveProductCondition', `
        return class StockModel {
            static getControlStockMonthsBack(v) { return Math.min(Math.max(Number.parseInt(v, 10) || 12, 1), 36); }
            static controlStockCanonicalCode(value) { return String(value ?? '').trim().toUpperCase().replace(/^([A-Z]+)0*([0-9]+)$/, (_, letters, digits) => letters + (digits.replace(/^0+(?=\d)/, '') || '0')); }
            static async getControlStockProviderMapByCodes() { return new Map(); }
            static async getDatCompraMapByCodes() { return new Map(); }
            static async getFechaEstimadaMapByCodesFast() { return new Map(); }
            ${method}
        };
    `);
    return { Model: constructor(pool, condition), calls };
};

test('query de planificación sin filtros: mismo límite y cálculo de 12 meses', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('getControlStock({', 'getById({'));
    assert.deepEqual(await Model.getControlStock({ limit: 2000, monthsBack: 12 }), []);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [12, 2000]);
    assert.match(calls[0].sql, /WITH productos_base AS/);
    assert.match(calls[0].sql, /COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0/);
    assert.match(calls[0].sql, /LIMIT \$2/);
    assert.doesNotMatch(calls[0].sql, /AND EXISTS \(\s*SELECT 1 FROM productos_base pb/);
});

test('query combinada mantiene parámetros enlazados y filtros en CTE base', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('getControlStock({', 'getById({'));
    await Model.getControlStock({ provider: 'P2', collection: '21', productName: 'Lino azul', monthsBack: 6, limit: 500 });
    const { sql, params } = calls[0];
    assert.deepEqual(params, [6, 500, 'P2', '21', '%Lino%', '%azul%']);
    const base = sql.slice(sql.indexOf('productos_base AS ('), sql.indexOf('ultimo_proveedor AS ('));
    assert.match(base, /COALESCE\(NULLIF\(TRIM\(productos\.codfamil::text\), ''\), ''\) = \$4/);
    assert.match(base, /productos\.desprodu ILIKE \$5/);
    assert.match(base, /productos\.codprodu::text ILIKE \$6/);
    assert.match(sql, /COALESCE\(ultimo_proveedor.codprove, ''\) = \$3/);
    assert.match(sql, /AND EXISTS \(\s*SELECT 1 FROM productos_base pb/);
});

test('producto seleccionado aplica igualdad exacta sin filtro parcial ambiguo', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('getControlStock({', 'getById({'));
    await Model.getControlStock({ productName: 'ARE013', productCode: 'ARE013' });
    const { sql, params } = calls[0];
    assert.deepEqual(params, [12, 500, 'ARE013']);
    assert.match(sql, /TRIM\(productos\.codprodu::text\) = \$3/);
    assert.doesNotMatch(sql, /productos\.desprodu ILIKE \$3/);
});

test('query de sugerencias limitada, usa catálogo sin agregaciones de facturación', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('searchControlStockProducts(', 'getControlStockFilters('));
    assert.deepEqual(await Model.searchControlStockProducts('Lino azul'), []);
    assert.deepEqual(calls[0].params, ['%Lino%', '%azul%', 'Lino%']);
    assert.match(calls[0].sql, /LIMIT 10/);
    assert.match(calls[0].sql, /obsoleto/);
    assert.doesNotMatch(calls[0].sql, /FROM facventa|FROM stocklotes|FROM albcompra_linea/);
    assert.deepEqual(await Model.searchControlStockProducts('a'), []);
    assert.equal(calls.length, 1);
});


test('búsqueda explícita muestra incluso catálogo sin consumo o sin necesidad de compra', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('getControlStock({', 'getById({'));
    await Model.getControlStock({ productName: 'Lino azul', limit: 500 });
    const sql = calls[0].sql;
    assert.match(sql, /AND \(TRUE OR COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0\)/);
    assert.match(sql, /AND \(TRUE OR \(/);
    assert.match(sql, /resultados_priorizados AS MATERIALIZED/);
    assert.match(sql, /FROM resultados_priorizados priorizados/);
    assert.deepEqual(calls[0].params, [12, 500, '%Lino%', '%azul%']);
});

test('consulta general conserva selección de necesidades y evita meses de productos sin consumo', async () => {
    const { Model, calls } = buildMockedModel(isolateMethod('getControlStock({', 'getById({'));
    await Model.getControlStock({ limit: 2000 });
    const sql = calls[0].sql;
    assert.match(sql, /AND \(FALSE OR COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0\)/);
    assert.match(sql, /AND \(FALSE OR \(/);
    assert.match(sql, /resumen_consumo AS \(/);
    assert.match(sql, /COUNT\(\*\)::numeric AS repeticiones/);
    assert.deepEqual(calls[0].params, [12, 2000]);
});
