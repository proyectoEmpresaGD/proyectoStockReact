import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    baselineForRefresh, reconcileActivityState, groupConfirmedReceipts, updateStoredActivity,
} from '../../src/features/entradas/entradasUtils.js';
import {
    readDesktopPreference, saveDesktopPreference, requestDesktopPermission, showDesktopActivity,
} from '../../src/features/entradas/browserNotifications.js';

const date = '2026-10-23';
const receipts = (...items) => groupConfirmedReceipts(items.map(([id, quantity, codprodu = 'ARE001']) => ({
    codprodu, desprodu: 'TEJIDO ARE', cantidad: quantity, receiptLineId: id,
})));
const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('primera lectura no notifica albaranes históricos; entrada posterior sí', () => {
    const baseline = updateStoredActivity(null, receipts(['R1', 5]), date, true);
    assert.equal(baseline.notifications.length, 0);
    const next = updateStoredActivity(baseline, receipts(['R1', 5], ['R2', 7]), date, true);
    assert.equal(next.notifications.length, 1);
    assert.equal(next.notifications[0].change, 7);
    assert.equal(next.notifications[0].read, false);
    assert.equal(updateStoredActivity(next, receipts(['R1', 5], ['R2', 7]), date, true).notifications.length, 1);
});

test('si una consulta omite líneas y reaparecen, no notificar una entrada ficticia', () => {
    const first = updateStoredActivity(null, receipts(['R1', 5], ['R2', 8]), date, true);
    const temporarilyMissing = updateStoredActivity(first, receipts(['R2', 8]), date, true);
    assert.deepEqual(temporarilyMissing.receiptIds.sort(), first.receiptIds.sort());
    const back = updateStoredActivity(temporarilyMissing, receipts(['R1', 5], ['R2', 8]), date, true);
    assert.equal(back.notifications.length, 0);
});

test('los errores de transporte no modifican el punto de referencia y sigue detectando cambios al recuperar', () => {
    const first = updateStoredActivity(null, [], date, true);
    const second = updateStoredActivity(first, receipts(['R1', 15]), date, true);
    assert.equal(second.notifications.length, 1);
    assert.equal(second.notifications[0].change, 15);
});

test('tras cambiar de día con la app abierta, la primera recepción del día sí genera aviso', () => {
    const firstDay = updateStoredActivity(null, receipts(['ALB22', 4]), '2026-10-22', true);
    assert.equal(firstDay.notifications.length, 0);
    const afterMidnight = baselineForRefresh(null, date, '2026-10-22', true);
    assert.deepEqual(afterMidnight.receiptIds, []);
    const next = updateStoredActivity(afterMidnight, receipts(['ALB23', 10]), date, true);
    assert.equal(next.notifications.length, 1);
    assert.equal(next.notifications[0].change, 10);
});

test('si el usuario acaba de abrir la app, la primera consulta no genera cientos de alertas', () => {
    const fresh = baselineForRefresh(null, date, null, true);
    assert.equal(fresh.snapshot, null);
    assert.equal(updateStoredActivity(fresh, receipts(['R1', 5]), date, true).notifications.length, 0);
});

test('lecturas reiteradas no reactivan avisos ya marcados como leídos', () => {
    const first = updateStoredActivity(null, [], date, true);
    const next = updateStoredActivity(first, receipts(['R1', 5]), date, true);
    const read = { ...next, notifications: next.notifications.map(x => ({ ...x, read: true })) };
    const again = updateStoredActivity(read, receipts(['R1', 5]), date, true);
    assert.equal(again.notifications.length, 1);
    assert.equal(again.notifications[0].read, true);
});

test('si llegan varias líneas de la misma referencia en una actualización, se agrupan en una alerta', () => {
    const first = updateStoredActivity(null, [], date, true);
    const next = updateStoredActivity(first, receipts(['L1', 2], ['L2', 3], ['L3', 4]), date, true);
    assert.equal(next.notifications.length, 1);
    assert.equal(next.notifications[0].change, 9);
});

test('preferencias de notificaciones de escritorio separadas por usuario', () => {
    const values = new Map();
    const store = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    saveDesktopPreference('comercial1', true, store);
    assert.equal(readDesktopPreference('comercial1', store), true);
    assert.equal(readDesktopPreference('comercial2', store), false);
    saveDesktopPreference('comercial1', false, store);
    assert.equal(readDesktopPreference('comercial1', store), false);
});

test('permisos denegados no activan notificaciones; sin permiso no se emiten', async () => {
    const original = globalThis.isSecureContext;
    globalThis.isSecureContext = true;
    try {
        assert.equal(await requestDesktopPermission({ permission: 'denied' }), false);
        assert.equal(showDesktopActivity([{ codprodu: 'ARE001' }], { permission: 'denied' }), false);
    } finally { globalThis.isSecureContext = original; }
});

test('los avisos de escritorio se agrupan y conducen a la referencia detectada', () => {
    const emitted = [];
    class MockNotification {
        static permission = 'granted';
        constructor(title, options) { emitted.push({ title, options, instance: this }); }
        close() {}
    }
    const hostWindow = { focus() {}, location: { hash: '' } };
    assert.equal(showDesktopActivity([
        { codprodu: 'ARE001', desprodu: 'ARE', change: 10, date },
        { codprodu: 'ARE002', desprodu: 'ARE', change: 3, date },
    ], MockNotification, hostWindow), true);
    assert.equal(emitted.length, 1);
    emitted[0].instance.onclick();
    assert.match(hostWindow.location.hash, /ARE001/);
});

test('el sondeo está protegido contra solapamientos y contempla recuperación y tiempo máximo', () => {
    const context = source('src/features/entradas/StockActivityContext.jsx');
    assert.match(context, /if \(inFlightRef\.current\) return inFlightRef\.current/);
    assert.match(context, /REQUEST_TIMEOUT_MS/);
    assert.match(context, /addEventListener\('online', onOnline\)/);
    assert.match(context, /addEventListener\('storage', onStorage\)/);
    assert.match(context, /lastSuccessfulDateRef\.current = date/);
    assert.match(context, /userCanAccessRoute\(role, '\/entradas'/);
    assert.doesNotMatch(context, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});


test('sin localStorage disponible conserva el estado en memoria y detecta nuevos documentos', () => {
    let inMemory = updateStoredActivity(null, receipts(['R1', 5]), date, true);
    const previous = reconcileActivityState(null, inMemory, date);
    const next = updateStoredActivity(previous, receipts(['R1', 5], ['R2', 6]), date, true);
    assert.equal(next.notifications.length, 1);
    assert.equal(next.notifications[0].change, 6);
});

test('reconcilia notificaciones de pestañas y conserva estados leídos sin repetir avisos', () => {
    const before = updateStoredActivity(null, [], date, true);
    const second = updateStoredActivity(before, receipts(['L1', 8]), date, true);
    const alreadyRead = { ...second, notifications: second.notifications.map(item => ({ ...item, read: true })) };
    const after = reconcileActivityState(alreadyRead, second, date);
    assert.equal(after.notifications.length, 1);
    assert.equal(after.notifications[0].read, true);
    assert.deepEqual(after.receiptIds, ['ARE001|L1']);
});
