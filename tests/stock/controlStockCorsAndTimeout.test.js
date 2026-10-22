import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchStockWithRecovery } from '../../src/services/stockControlFetchRecovery.js';

const backendVercel = JSON.parse(readFileSync(new URL('../../server/vercel.json', import.meta.url)));
const noWait = async () => {};

test('Vercel añade cabeceras CORS solo al origen de producción y no altera el enrutamiento', () => {
    const [first, route] = backendVercel.routes;
    assert.equal(first.continue, true);
    assert.match(first.src, /control-stock/);
    assert.equal(first.has[0].key, 'Origin');
    assert.match(first.has[0].value, /proyecto-stock-react/);
    assert.equal(first.headers['Access-Control-Allow-Origin'], 'https://proyecto-stock-react.vercel.app');
    assert.match(first.headers['Access-Control-Allow-Headers'], /Authorization/);
    assert.equal(first.headers['Access-Control-Allow-Credentials'], 'true');
    assert.equal(route.dest, 'index.js');
    assert.equal(backendVercel.builds[0].use, '@vercel/node');
    assert.equal(backendVercel.crons.length, 1);
});

test('un error 504 después de una consulta lenta no dispara más cargas pesadas', async () => {
    let clock = 1000;
    let calls = 0;
    const result = await fetchStockWithRecovery('/api/stock/control-stock', {}, {
        fetchImpl: async () => { calls++; clock += 20000; return { status: 504, ok: false }; },
        wait: noWait,
        now: () => clock,
    });
    assert.equal(result.status, 504);
    assert.equal(calls, 1);
});

test('fallo prolongado de red no se reintenta varias veces', async () => {
    let clock = 1000;
    let calls = 0;
    await assert.rejects(fetchStockWithRecovery('/api/stock/control-stock', {}, {
        fetchImpl: async () => { calls++; clock += 18000; throw new TypeError('Failed to fetch'); },
        wait: noWait,
        now: () => clock,
    }), /servidor interrumpió la conexión/);
    assert.equal(calls, 1);
});

test('un fallo corto 503 continúa reintentando de forma limitada', async () => {
    let calls = 0;
    const result = await fetchStockWithRecovery('/api/stock/control-stock', {}, {
        fetchImpl: async () => (++calls === 1 ? { status: 503, ok: false } : { status: 200, ok: true }),
        wait: noWait,
    });
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
});
