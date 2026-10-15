import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadModel(path, start, className, fakePool, extra = {}) {
    let source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    source = source.slice(source.indexOf(start)).replaceAll(`export class ${className}`, `class ${className}`);
    const names = ['pool', ...Object.keys(extra)];
    const values = [fakePool, ...Object.values(extra)];
    return new Function(...names, `${source}\nreturn ${className};`)(...values);
}

const buildPool = () => {
    const queries = [];
    return {
        queries,
        async query(sql, params = []) {
            queries.push({ sql, params });
            if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 17 }] };
            return { rows: [{ codclien: 'A1', total_billing: '125.1234' }] };
        },
    };
};

const clientColumns = ['codclien', 'razclien', 'codrepre', 'dadobaja', 'codtarifa', 'localidad'];

test('listado, total y orden de pedidos usan filtros parametrizados consistentes', async () => {
    const pool = buildPool();
    const Model = loadModel('server/models/Postgres/clients.js', 'const buildNormalizedClientSearch =', 'ClienteModel', pool, { CLIENT_FIELDS: clientColumns });
    const args = { codpais: 'ES', codprovi: '28', query: 'A1', codrepres: ['REP01'], limit: 10, offset: 20 };
    await Model.getAll(args);
    assert.deepEqual(pool.queries[0].params, [['REP01'], 'ES', '28', '%a1%', 10, 20]);
    assert.match(pool.queries[0].sql, /codclien::text/);
    assert.match(pool.queries[0].sql, /SELECT MAX\(v\.fecha\)/);
    const total = await Model.getCount(args);
    assert.equal(total, 17);
    assert.deepEqual(pool.queries[1].params, [['REP01'], 'ES', '28', '%a1%']);
    const ranked = await Model.getClientsWithBilling(args);
    assert.equal(ranked.length, 1);
    assert.match(pool.queries[2].sql, /ORDER BY total_billing DESC/);
    assert.deepEqual(pool.queries[2].params, pool.queries[0].params);
});

test('la consulta SQL no acepta columnas arbitrarias para editar un cliente', async () => {
    const pool = buildPool();
    const Model = loadModel('server/models/Postgres/clients.js', 'const buildNormalizedClientSearch =', 'ClienteModel', pool, { CLIENT_FIELDS: clientColumns });
    await assert.rejects(() => Model.update({ codclien: 'A1', input: { 'x" = now(); --': 'x' } }), /no autorizados/);
    await assert.rejects(() => Model.update({ codclien: 'A1', input: { codrepre: 'REP02' } }), /no autorizados/);
    await Model.update({ codclien: 'A1', input: { razclien: 'Cambio seguro', codtarifa: '01' } });
    assert.match(pool.queries.at(-1).sql, /"razclien" = \$2, "codtarifa" = \$3/);
    assert.deepEqual(pool.queries.at(-1).params, ['A1', 'Cambio seguro', '01']);
    await Model.update({ codclien: 'A1', input: { codrepre: 'REP02' }, allowRepresentativeChange: true });
    assert.match(pool.queries.at(-1).sql, /"codrepre" = \$2/);
});

test('el stock de fichas solo solicita códigos seleccionados y no confunde parámetros', async () => {
    const pool = buildPool();
    const Model = loadModel('server/models/Postgres/stock.js', 'const CODALMAC_CERO_FILTER =', 'StockModel', pool, { FAMILY_NAME_BY_CODE: {} });
    Model.getDatCompraMapByCodes = async () => new Map();
    await Model.getAll({ empresa: '01', ejercicio: '2026', codes: ['ARE1', 'ARE2'] });
    const { sql, params } = pool.queries[0];
    assert.deepEqual(params, ['01', '2026', ['ARE1', 'ARE2'], '01', '2026', ['ARE1', 'ARE2']]);
    for (let i = 1; i <= params.length; i++) assert.match(sql, new RegExp(`\\$${i}(?!\\d)`));
    assert.match(sql, /pr\.codprodu\) = ANY\(\$3::text\[\]\)/);
    assert.match(sql, /s\.codprodu = ANY\(\$6::text\[\]\)/);
    assert.deepEqual(await Model.getAll({ codes: [] }), []);
});
