import test from 'node:test';
import assert from 'node:assert/strict';
import {
    localISODate, offsetLocalDate, groupEntries, detectIncreases,
    makeSnapshot, updateStoredActivity, normalizeSearch,
} from '../../src/features/entradas/entradasUtils.js';

test('las fechas son locales y el salto de día contempla el fin de mes', () => {
    assert.equal(localISODate(new Date(2026, 9, 21, 1, 30)), '2026-10-21');
    assert.equal(offsetLocalDate('2026-03-01', -1), '2026-02-28');
});

test('agrupa un producto repetido y conserva cantidad y fecha recientes', () => {
    const rows = groupEntries([
        { codprodu: 'ARE001', desprodu: 'Lino', cancompra: '10.5', fecultmod: '2026-10-21T09:00:00Z' },
        { codprodu: 'are001', desprodu: 'Lino', cancompra: 6, fecultmod: '2026-10-21T10:00:00Z' },
        { codprodu: 'BAS004', desprodu: 'Terciopelo', cancompra: null },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].quantity, 16.5);
    assert.equal(rows[0].recordCount, 2);
    assert.equal(rows[0].timestamp, Date.parse('2026-10-21T10:00:00Z'));
    assert.equal(rows[1].quantity, 0);
});

test('el primer sondeo no genera avisos históricos', () => {
    const entries = groupEntries([{ codprodu: 'ARE001', cancompra: 10 }]);
    const stored = updateStoredActivity(null, entries, '2026-10-21');
    assert.deepEqual(stored.notifications, []);
    assert.deepEqual(stored.snapshot, { ARE001: 10 });
});

test('avisa solo de aumentos y no de un cambio de fecha o disminución', () => {
    const today = '2026-10-21';
    const before = { ARE001: 10, BAS004: 14 };
    const after = groupEntries([
        { codprodu: 'ARE001', desprodu: 'Lino', cancompra: 12 },
        { codprodu: 'BAS004', cancompra: 11 },
        { codprodu: 'HAR017', desprodu: 'Seda', cancompra: 7 },
    ]);
    const updates = detectIncreases(before, after, today);
    assert.equal(updates.length, 2);
    assert.deepEqual(updates.map((item) => item.codprodu).sort(), ['ARE001', 'HAR017']);
    let state = updateStoredActivity({ date: today, snapshot: before, notifications: [] }, after, today);
    assert.equal(state.notifications.length, 2);
    state = updateStoredActivity(state, after, today);
    assert.equal(state.notifications.length, 2);
    assert.deepEqual(makeSnapshot(after), state.snapshot);
});

test('días diferentes no mezclan lecturas; búsqueda ignora tildes', () => {
    const state = updateStoredActivity({ date: '2026-10-20', snapshot: { ARE001: 3 }, notifications: [{ id: 'previous' }] }, [], '2026-10-21');
    assert.equal(state.notifications.length, 0);
    assert.deepEqual(state.snapshot, {});
    assert.equal(normalizeSearch('  COLECCIÓN  '), 'coleccion');
});
