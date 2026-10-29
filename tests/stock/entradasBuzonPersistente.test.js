import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    datesToRecover, inboxKey, mergeInbox, monitorKey, readInbox,
    readMonitorDate, saveInbox, saveMonitorDate, readLegacyDailyNotices,
} from '../../src/features/entradas/activityInbox.js';

function storage() {
    const map = new Map();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => { map.set(key, value); },
    };
}
const notice = (id, date, read = false) => ({
    id, date, codprodu: 'TEL001', desprodu: 'Tela', change: 2,
    detectedAt: `${date}T10:00:00Z`, read, kind: 'receipt',
});

test('buzón acumula entradas de varios días sin perder avisos antiguos', () => {
    const db = storage();
    const first = notice('1', '2026-10-27');
    const second = notice('2', '2026-10-28');
    saveInbox('ventas', [first], db);
    saveInbox('ventas', mergeInbox(readInbox('ventas', db), [second]), db);
    assert.deepEqual(readInbox('ventas', db).map(({ id }) => id), ['2', '1']);
    assert.equal(readInbox('otro-usuario', db).length, 0);
});

test('un aviso leído nunca vuelve a figurar pendiente por otro sondeo', () => {
    const earlier = notice('1', '2026-10-27', true);
    const stale = notice('1', '2026-10-27', false);
    const merged = mergeInbox([earlier], [stale]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].read, true);
});

test('límite y ordenación evitan que una bandeja inmensa agote localStorage', () => {
    const days = Array.from({ length: 12 }, (_, i) => notice(String(i), `2026-10-${String(i + 10).padStart(2, '0')}`));
    const result = mergeInbox(days, [days[4]], 5);
    assert.deepEqual(result.map((r) => r.id), ['11','10','9','8','7']);
});

test('última fecha consultada y recuperación del intervalo de días anterior', () => {
    const db = storage();
    assert.equal(readMonitorDate('ventas', db), null);
    saveMonitorDate('ventas', '2026-10-26', db);
    saveMonitorDate('ventas', '2026-10-24', db);
    assert.equal(readMonitorDate('ventas', db), '2026-10-26');
    assert.deepEqual(datesToRecover('2026-10-26','2026-10-28'), ['2026-10-26', '2026-10-27']);
    assert.deepEqual(datesToRecover('2026-10-28','2026-10-28'), []);
    assert.equal(datesToRecover('2026-10-01','2026-10-28').length, 7);
    assert.notEqual(monitorKey('otro'), monitorKey('ventas'));
    assert.notEqual(inboxKey('otro'), inboxKey('ventas'));
});

test('almacenamiento deshabilitado no interrumpe el sondeo', () => {
    const blocked = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } };
    assert.deepEqual(readInbox('ventas', blocked), []);
    assert.equal(saveInbox('ventas', [notice('1','2026-10-28')], blocked), false);
    assert.equal(readMonitorDate('ventas', blocked), null);
    assert.doesNotThrow(() => saveMonitorDate('ventas', '2026-10-28', blocked));
});


test('migra avisos de días anteriores sin confundir a otros usuarios', () => {
    const map = new Map();
    const db = {
        get length() { return map.size; },
        key(i) { return [...map.keys()][i]; },
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) { map.set(key, value); },
    };
    db.setItem('cjm:stock-activity:recepciones-v1:ventas:2026-10-26', JSON.stringify({ notifications: [notice('a','2026-10-26')] }));
    db.setItem('cjm:stock-activity:recepciones-v1:ventas:2026-10-27', JSON.stringify({ notifications: [notice('b','2026-10-27',true)] }));
    db.setItem('cjm:stock-activity:recepciones-v1:admin:2026-10-28', JSON.stringify({ notifications: [notice('c','2026-10-28')] }));
    assert.deepEqual(readLegacyDailyNotices('ventas',db).map((item)=>item.id), ['b','a']);
});


test('el límite conserva avisos antiguos pendientes antes que avisos recientes leídos', () => {
    const oldest = notice('antiguo', '2026-10-01');
    const recent = notice('reciente', '2026-10-27', true);
    const latest = notice('ultimo', '2026-10-28', true);
    assert.deepEqual(mergeInbox([oldest, recent, latest], [], 2).map((item) => item.id),
        ['ultimo', 'antiguo']);
});
