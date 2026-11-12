import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOrderHInvoiceExclusionSql } from '../../server/utils/clientInvoiceSeriesAccess.js';

const source = readFileSync(new URL('../../server/models/Postgres/clients.js', import.meta.url), 'utf8');

function loadModel() {
    const queries = [];
    const pool = {
        async query(sql, params = []) {
            queries.push({ sql, params });
            return /COUNT\(\*\)/i.test(sql)
                ? { rows: [{ count: '1' }] }
                : { rows: [{ codclien: 'ACTIVO', dadobaja: 'N' }] };
        },
    };
    const code = source.slice(source.indexOf('const buildNormalizedClientSearch ='))
        .replace('export class ClienteModel', 'class ClienteModel');
    const Model = new Function('pool', 'CLIENT_FIELDS', 'buildOrderHInvoiceExclusionSql', `${code}\nreturn ClienteModel;`)(pool, [], buildOrderHInvoiceExclusionSql);
    return { Model, queries };
}

const activeFilter = (alias = 'clientes') =>
    `COALESCE(UPPER(TRIM(${alias}.dadobaja::text)), '') <> 'S'`;

test('listado, recuento, sugerencias, búsqueda de duplicados y provincia excluyen bajas con espacios', async () => {
    const { Model, queries } = loadModel();
    await Model.getAll({ offset: 0, limit: 10, codrepres: ['REP01'] });
    await Model.getCount({ codrepres: ['REP01'] });
    await Model.search({ query: 'cliente', codrepres: ['REP01'] });
    await Model.checkExisting({ query: 'cliente', localidad: 'Madrid' });
    await Model.getByProvince({ codprovi: '28', codrepres: ['REP01'] });

    assert.equal(queries.length, 5);
    for (const { sql } of queries) {
        assert.ok(sql.includes(activeFilter()), `Falta filtro de baja normalizado en:\n${sql}`);
        assert.doesNotMatch(sql, /COALESCE\(UPPER\(dadobaja\)/);
    }
    assert.deepEqual(queries[0].params, [['REP01'], 10, 0]);
    assert.deepEqual(queries[1].params, [['REP01']]);
    assert.deepEqual(queries[2].params, ['%cliente%', ['REP01'], 10]);
});

test('ordenación por importe no incluye clientes de baja y mantiene sus permisos de cartera', async () => {
    const { Model, queries } = loadModel();
    await Model.getClientsWithBilling({ limit: 25, offset: 0, order: 'DESC', codrepres: ['REP01'] });
    assert.equal(queries.length, 1);
    const [{ sql, params }] = queries;
    assert.ok(sql.includes(activeFilter('c')));
    assert.match(sql, /c\.codrepre = ANY\(\$1\)/);
    assert.match(sql, /ORDER BY total_billing DESC/);
    assert.deepEqual(params, [['REP01'], 25, 0]);
});

test('las fichas históricas por código siguen consultables sin cambiar ni borrar registros', async () => {
    const { Model, queries } = loadModel();
    await Model.getById({ codclien: 'BAJA' });
    await Model.getByCodclien({ codclien: 'BAJA' });
    assert.equal(queries.length, 2);
    for (const { sql, params } of queries) {
        assert.match(sql, /FROM clientes\s+WHERE codclien = \$1/);
        assert.deepEqual(params, ['BAJA']);
        assert.doesNotMatch(sql, /TRIM\(.*dadobaja/);
    }
});
