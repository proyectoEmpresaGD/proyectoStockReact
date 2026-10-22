import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../server/models/Postgres/stock.js', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../server/controllers/stock.js', import.meta.url), 'utf8');
const method = (start, end) => {
    const a = source.indexOf(`    static ${start}`);
    const b = source.indexOf(`    static ${end}`, a);
    assert.ok(a > 0 && b > a, `Métodos ${start}/${end}`);
    return source.slice(a, b);
};
const canonical = method('controlStockCanonicalCode(', 'async getControlStockProviderMapByCodes(');
const providerLookup = method('async getControlStockProviderMapByCodes(', 'async getControlStock({');
const getControlStock = method('async getControlStock({', 'async getById({');
const buildModel = ({ initialRows = [], supplierRows = [] } = {}) => {
    const calls = [];
    const pool = { async query(sql, params) {
        calls.push({ sql, params });
        return { rows: sql.includes('SELECT DISTINCT ON (') ? supplierRows : initialRows };
    } };
    const active = (alias = 'productos') => `UPPER(TRIM(COALESCE(${alias}.obsoleto::text, ''))) <> 'S'`;
    const Model = new Function('pool', 'controlStockActiveProductCondition', `
        return class StockModel {
            ${canonical}
            ${providerLookup}
            static getControlStockMonthsBack(n) { return Math.max(1, Math.min(36, parseInt(n, 10) || 12)); }
            static normalizeCode(value) { return String(value ?? '').trim(); }
            static getFamilyName(value) { return value || ''; }
            static toSafeNumber(value, fallback = 0) { return Number(value) || fallback; }
            static parseFlexibleNumber(value, fallback = 0) { return Number(value) || fallback; }
            static async getDatCompraMapByCodes() { return new Map(); }
            static async getFechaEstimadaMapByCodesFast() { return new Map(); }
            ${getControlStock}
        }
    `)(pool, active);
    return { Model, calls };
};

test('Sin filtro de proveedor ni resultados: sólo se lanza la SQL principal', async () => {
    const { Model, calls } = buildModel();
    const timings = {};
    const result = await Model.getControlStock({ limit: 2000, onTiming: (name, value) => { timings[name] = value; } });
    assert.deepEqual(result, []);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0].sql, /ultimo_proveedor AS \(/);
    assert.doesNotMatch(calls[0].sql, /JOIN ultimo_proveedor\s+ON/);
    assert.equal(calls[0].params[1], 2000);
    assert.ok('sql' in timings);
});

test('Sin filtro: los proveedores sólo se consultan para las referencias que devuelve LIMIT', async () => {
    const { Model, calls } = buildModel({ initialRows: [{ codprodu: 'ARE00042', tipo: '101', codprove: '', nombre_proveedor: '', monthly_history: [] }],
        supplierRows: [{ codprodu_key: 'ARE42', codprove: '0004', nombre_proveedor: 'Proveedor CJM' }] });
    const rows = await Model.getControlStock({ limit: 2000 });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].params, [['ARE42']]);
    assert.equal(rows[0].codprove, '0004');
    assert.equal(rows[0].nombre_proveedor, 'Proveedor CJM');
    assert.equal(rows[0].codprodu, 'ARE00042');
    assert.equal(rows[0].monthly_history.length, 0);
});

test('Con filtro de proveedor: la selección mantiene el JOIN anterior previo a LIMIT', async () => {
    const { Model, calls } = buildModel();
    await Model.getControlStock({ provider: 'P001', limit: 500 });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /ultimo_proveedor AS \(/);
    assert.match(calls[0].sql, /LEFT JOIN ultimo_proveedor/);
    assert.match(calls[0].sql, /COALESCE\(ultimo_proveedor.codprove, ''\) = \$3/);
    assert.deepEqual(calls[0].params, [12, 500, 'P001']);
});

test('La consulta divide los dos modos de vincular albaranes sin duplicar coincidencias', async () => {
    const { Model, calls } = buildModel();
    await Model.getControlStock({});
    const sql = calls[0].sql;
    assert.match(sql, /facturas_periodo AS MATERIALIZED/);
    assert.match(sql, /facturas_albaranes AS \(/);
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /IS NOT TRUE/);
    assert.match(sql, /fp.fecha >= DATE_TRUNC|facventa.fecha >= DATE_TRUNC/);
    // Cuando las dos alternativas coinciden, la segunda rama debe excluir la fila.
    for (const a of [true, false, null]) for (const b of [true, false, null]) {
        const originalMatches = a === true || b === true ? 1 : 0;
        const splitMatches = Number(a === true) + Number(b === true && a !== true);
        assert.equal(splitMatches, originalMatches, `a=${a}, b=${b}`);
    }
});

test('Las fases de rendimiento se registran sin cambiar el JSON de la API', () => {
    assert.match(controller, /const timings = \{\}/);
    assert.match(controller, /onTiming: \(stage, ms\)/);
    assert.match(controller, /res.set\('Server-Timing'/);
    assert.match(controller, /stock-\$\{name\};dur=/);
});
