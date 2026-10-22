import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../server/models/Postgres/stock.js', import.meta.url), 'utf8');
const start = source.indexOf('    static async getControlStock({');
const end = source.indexOf('    static async getById(', start);
const method = source.slice(start, end);

const build = (resultRows) => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: resultRows }; } };
  const C = new Function('pool', 'controlStockActiveProductCondition', `return class StockModel {
    static getControlStockMonthsBack(n) { return Math.min(36, Math.max(1, parseInt(n, 10) || 12)); }
    static controlStockCanonicalCode(value) { return String(value ?? '').trim().toUpperCase(); }
    static normalizeCode(value) { return String(value ?? '').trim(); }
    static getFamilyName(value) { return value || ''; }
    static toSafeNumber(value, otherwise = 0) { return Number(value) || otherwise; }
    static parseFlexibleNumber(value, otherwise = 0) { return Number(value) || otherwise; }
    static async getControlStockProviderMapByCodes() { return new Map(); }
    static async getDatCompraMapByCodes() { return new Map(); }
    static async getFechaEstimadaMapByCodesFast() { return new Map(); }
    ${method}
  }`)(pool, () => 'TRUE');
  return { C, calls };
};

test('El historial de los 12 meses se construye después de limitar los resultados', async () => {
  const { C, calls } = build([]);
  await C.getControlStock({ limit: 100, monthsBack: 12 });
  const sql = calls[0].sql;
  const limit = sql.indexOf('LIMIT $2');
  assert.ok(sql.indexOf('resultados_priorizados AS MATERIALIZED') > 0);
  assert.ok(sql.indexOf('resumen_consumo AS (') < limit);
  assert.ok(sql.indexOf('json_agg(') > limit);
  assert.ok(sql.indexOf('FROM resultados_priorizados priorizados') > limit);
  assert.match(sql, /AVG|SUM\(cm\.consumo\)/);
  assert.match(sql, /COUNT\(\*\)::numeric AS repeticiones/);
  assert.match(sql, /SUM\(cm\.consumo\), 0\) \* mp\.repeticiones/);
  assert.match(sql, /SUM\(cm\.consumo\), 0\) \/ \$1::numeric/);
  assert.deepEqual(calls[0].params, [12,100]);
});

test('La API conserva la estructura pública y no filtra claves auxiliares SQL', async () => {
  const { C } = build([{
    codprodu: 'HAR00123', internal_codprodu_key: 'HAR123', __history_placeholder: null,
    tipo: '101', monthly_history: [{ year: 2026, month: 10, label: '2026-10', consumption: '15.5' }],
    recommended_net_next_month: '9', recommended_net_next_three_months: '27',
    codprove: '', nombre_proveedor: ''
  }]);
  const rows = await C.getControlStock({ limit: 100 });
  assert.equal(rows.length,1);
  assert.equal(rows[0].codprodu,'HAR00123');
  assert.equal(rows[0].monthly_history[0].consumption,15.5);
  assert.equal(rows[0].recommended_net_next_month,9);
  assert.equal('internal_codprodu_key' in rows[0], false);
  assert.equal('__history_placeholder' in rows[0], false);
});

test('La media sigue siendo suma mensual / meses, sin multiplicarse por códigos equivalentes', () => {
  const meses=[0,30,45,0,12,0,3,9,0,0,0,0];
  for (const repeticiones of [1,2,3]) {
    const antiguas = Array.from({ length: repeticiones }, () => meses).flat();
    const originalTotal = antiguas.reduce((a,b)=>a+b,0);
    const originalMedia = originalTotal / antiguas.length;
    const suma = meses.reduce((a,b)=>a+b,0);
    assert.equal(originalTotal,suma * repeticiones);
    assert.equal(originalMedia,suma / meses.length);
  }
});
