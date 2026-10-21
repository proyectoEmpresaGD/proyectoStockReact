import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupEntries, sortStockActivity } from '../../src/features/entradas/entradasUtils.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('más reciente y más antigua invierten por marca temporal, sin modificar el origen', () => {
    const entries = groupEntries([
        { codprodu: 'CJM02', cancompra: 4, fecultmod: '2026-10-21T11:00:00Z' },
        { codprodu: 'CJM01', cancompra: 5, fecultmod: '2026-10-21T08:00:00Z' },
        { codprodu: 'CJM03', cancompra: 6, fecultmod: '2026-10-21T14:00:00Z' },
    ]);
    const initial = entries.map(({ codprodu }) => codprodu);
    assert.deepEqual(sortStockActivity(entries, 'recent').map((row) => row.codprodu), ['CJM03', 'CJM02', 'CJM01']);
    assert.deepEqual(sortStockActivity(entries, 'oldest').map((row) => row.codprodu), ['CJM01', 'CJM02', 'CJM03']);
    assert.deepEqual(entries.map(({ codprodu }) => codprodu), initial);
});

test('fechas ausentes se colocan al final tanto en ascendente como descendente', () => {
    const entries = groupEntries([
        { codprodu: 'DESCONOCIDO', cancompra: 20, fecultmod: null },
        { codprodu: 'ANTIGUO', cancompra: 10, fecultmod: '2026-10-20T08:00:00Z' },
        { codprodu: 'NUEVO', cancompra: 5, fecultmod: '2026-10-21T08:00:00Z' },
    ]);
    assert.deepEqual(sortStockActivity(entries, 'recent').map((row) => row.codprodu), ['NUEVO', 'ANTIGUO', 'DESCONOCIDO']);
    assert.deepEqual(sortStockActivity(entries, 'oldest').map((row) => row.codprodu), ['ANTIGUO', 'NUEVO', 'DESCONOCIDO']);
});

test('registros agrupados se ordenan por la modificación más reciente de cada referencia', () => {
    const entries = groupEntries([
        { codprodu: 'A', cancompra: 3, fecultmod: '2026-10-21T07:00:00Z' },
        { codprodu: 'A', cancompra: 2, fecultmod: '2026-10-21T12:00:00Z' },
        { codprodu: 'B', cancompra: 8, fecultmod: '2026-10-21T09:00:00Z' },
    ]);
    assert.deepEqual(sortStockActivity(entries, 'recent').map((row) => row.codprodu), ['A', 'B']);
    assert.deepEqual(sortStockActivity(entries, 'oldest').map((row) => row.codprodu), ['B', 'A']);
    assert.equal(entries.find((row) => row.codprodu === 'A').quantity, 5);
});

test('los filtros preexistentes permanecen disponibles y la paginación reinicia al cambiar el orden', () => {
    const page = source('src/pages/EntradasPages.jsx');
    assert.match(page, /<option value="recent">/);
    assert.match(page, /<option value="oldest">/);
    assert.match(page, /<option value="quantity">/);
    assert.match(page, /<option value="code">/);
    assert.match(page, /useEffect\(\(\) => \{ setPage\(1\); \}, \[search, sort, view, selectedDate\]\)/);
    assert.match(page, /El orden usa la última modificación de stock, no la hora de recepción de mercancía/);
    assert.match(source('src/features/entradas/entryCopy.js'), /'Actividad más antigua': 'Oldest stock activity first'/);
});
