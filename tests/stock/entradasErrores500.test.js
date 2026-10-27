import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getReceptionConfig, buildReceptionQuery, getRecepcionesCompraByDate,
    isReceptionSchemaError,
} from '../../server/services/recepcionesCompra.js';

test('fecha DATE o TIMESTAMP: evitar fecha::time directa; no fabricar hora si solo hay fecha', () => {
    const sql = buildReceptionQuery(getReceptionConfig({}));
    assert.match(sql, /\(a\.fecha::timestamp\)::time/);
    assert.doesNotMatch(sql, /a\.fecha::time\b/);
    assert.match(sql, /NULLIF\(\(a\.fecha::timestamp\)::time, TIME '00:00:00'\)/);
    assert.match(sql, /NULL::time/);
    assert.match(sql, /a\.fecha >= \$1::date/);
    assert.match(sql, /JOIN albcompra_linea l ON/);
});

test('hora optativa no puede romper toda la lista si la columna falta o contiene texto no válido', () => {
    for (const name of ['hora', 'horaentre']) {
        const sql = buildReceptionQuery(getReceptionConfig({ CJM_RECEPCION_HORA: name }));
        assert.match(sql, new RegExp(`to_jsonb\\(a\\)->>'${name}'`));
        assert.match(sql, /CASE WHEN BTRIM/);
        assert.match(sql, /ELSE NULL::time END/);
        assert.doesNotMatch(sql, new RegExp(`a\\.${name}::time`));
    }
});

test('estado optativo no causa fallo cuando el ERP no dispone de esa columna', () => {
    const sql = buildReceptionQuery(getReceptionConfig({}));
    assert.match(sql, /TRIM\(to_jsonb\(a\)->>'estalbcompra'\) AS estado/);
    assert.doesNotMatch(sql, /AND UPPER\(TRIM\(a\.estalbcompra/);
    const filtered = buildReceptionQuery(getReceptionConfig({ CJM_RECEPCION_ESTADOS: 'R' }));
    // Si se ha configurado filtro de estado, un esquema incompatible debe ser visible.
    assert.match(filtered, /AND UPPER\(TRIM\(a\.estalbcompra::text\)\) = ANY\(\$2::text\[\]\)/);
});

test('errores de esquema SQLSTATE se distinguen de fallos de conexión', () => {
    assert.equal(isReceptionSchemaError({ code: '42703' }), true);
    assert.equal(isReceptionSchemaError({ code: '42846' }), true);
    assert.equal(isReceptionSchemaError({ code: '42P01' }), true);
    assert.equal(isReceptionSchemaError({ code: 'ECONNRESET' }), false);
});

test('lectura idempotente: reintentar una vez un fallo transitorio sin alterar la fecha', async () => {
    let calls = 0;
    const db = { async query(sql, params) {
        calls += 1;
        assert.deepEqual(params, ['2026-10-27']);
        if (calls === 1) throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
        return { rows: [{ codprodu: 'HAR00064', cantidad: 25 }] };
    } };
    const rows = await getRecepcionesCompraByDate('2026-10-27', {}, db);
    assert.equal(calls, 2);
    assert.equal(rows[0].codprodu, 'HAR00064');
});

test('error de columna no se reintenta ni se transforma en lista vacía', async () => {
    let calls = 0;
    const error = Object.assign(new Error('column does not exist'), { code: '42703' });
    const db = { async query() { calls += 1; throw error; } };
    await assert.rejects(() => getRecepcionesCompraByDate('2026-10-27', {}, db), e => e === error);
    assert.equal(calls, 1);
});
