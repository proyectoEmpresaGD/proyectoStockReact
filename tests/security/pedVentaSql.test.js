import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../../server/models/Postgres/pedventa.js', import.meta.url), 'utf8');

test('INSERT de pedventa tiene 24 columnas, valores y parámetros', () => {
    const [, columns, placeholders] = code.match(/INSERT INTO pedventa\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i) || [];
    assert.ok(columns, 'consulta INSERT localizada');
    assert.equal(columns.split(',').length, 24);
    assert.deepEqual(placeholders.match(/\$\d+/g).map((v) => Number(v.slice(1))), Array.from({ length: 24 }, (_, i) => i + 1));
});
