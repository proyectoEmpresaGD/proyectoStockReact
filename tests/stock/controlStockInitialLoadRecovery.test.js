import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchStockWithRecovery, waitForStockRetry } from '../../src/services/stockControlFetchRecovery.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const hook = source('src/hooks/useStockControl.js');
const client = source('src/services/stockControlClient.js');
const page = source('src/pages/LowStockAlertsPage.jsx');
const routes = source('server/routes/stock.js');
const model = source('server/models/Postgres/stock.js');

const http = (status) => ({ ok: status >= 200 && status < 300, status });
const noWait = async () => {};

test('reintenta 503 y recupera resultados sin alterar la respuesta', async () => {
    const sequence = [http(503), http(200)];
    const retries = [];
    const result = await fetchStockWithRecovery('/stock', { signal: new AbortController().signal }, {
        fetchImpl: async () => sequence.shift(), wait: noWait,
        onRetry: (detail) => retries.push(detail),
    });
    assert.equal(result.status, 200);
    assert.deepEqual(retries.map((item) => item.status), [503]);
});

test('reintenta fallos temporales tipo Failed to fetch, pero limita los intentos', async () => {
    let calls = 0;
    const result = await fetchStockWithRecovery('/stock', {}, {
        fetchImpl: async () => { calls += 1; if (calls < 3) throw new TypeError('Failed to fetch'); return http(200); },
        wait: noWait,
    });
    assert.equal(result.status, 200);
    assert.equal(calls, 3);
    let failures = 0;
    await assert.rejects(fetchStockWithRecovery('/stock', {}, {
        fetchImpl: async () => { failures += 1; throw new TypeError('Failed to fetch'); },
        wait: noWait,
    }), /Failed to fetch/);
    assert.equal(failures, 3);
});

test('401, 403 y errores de validación nunca se reintentan', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
        let calls = 0;
        const result = await fetchStockWithRecovery('/stock', {}, {
            fetchImpl: async () => { calls += 1; return http(status); }, wait: noWait,
        });
        assert.equal(result.status, status);
        assert.equal(calls, 1);
    }
});

test('reintentos de 500/502/503/504 limitados para no saturar Vercel', async () => {
    for (const status of [500, 502, 503, 504]) {
        let calls = 0;
        const response = await fetchStockWithRecovery('/stock', {}, {
            fetchImpl: async () => { calls += 1; return http(status); }, wait: noWait,
        });
        assert.equal(response.status, status);
        assert.equal(calls, 3);
    }
});

test('cancelar mientras se espera un reintento impide peticiones adicionales', async () => {
    const controller = new AbortController();
    let calls = 0;
    const request = fetchStockWithRecovery('/stock', { signal: controller.signal }, {
        fetchImpl: async () => { calls += 1; return http(503); },
        delays: [5000],
        onRetry: () => controller.abort(),
    });
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal(calls, 1);
});

test('espera de reintento abortable y sin temporizadores persistentes', async () => {
    const controller = new AbortController();
    const wait = waitForStockRetry(10000, controller.signal);
    controller.abort();
    await assert.rejects(wait, { name: 'AbortError' });
    await assert.rejects(waitForStockRetry(10000, controller.signal), { name: 'AbortError' });
});

test('un intento colgado se cancela y la carga se recupera en el siguiente', async () => {
    let calls = 0;
    const result = await fetchStockWithRecovery('/stock', {}, {
        timeoutMs: 10,
        delays: [0],
        wait: noWait,
        fetchImpl: (_url, { signal }) => {
            calls += 1;
            if (calls === 2) return Promise.resolve(http(200));
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
            });
        },
    });
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
});

test('la carga de proveedores espera la primera consulta y puede recuperarse por separado', () => {
    assert.match(hook, /!token \|\| !initialRowsSettled/);
    assert.match(hook, /setInitialRowsSettled\(true\)/);
    assert.match(hook, /setFiltersRetryIndex\(\(value\) => value \+ 1\)/);
    assert.match(page, /onClick=\{reloadFilters\}/);
});

test('control de permisos, cálculos y límite 2000 siguen como antes', () => {
    assert.match(routes, /get\('\/control-stock', requirePurchasingRole/);
    assert.match(hook, /limit: '2000'/);
    assert.match(client, /fetchStockWithRecovery\(url/);
    assert.match(client, /if \(response\.status === 401\)/);
    assert.match(client, /if \(response\.status === 403\)/);
    assert.match(model, /const safeLimit = Math\.min\(Math\.max\(Number\.parseInt\(limit, 10\) \|\| 500, 1\), 2000\)/);
    assert.match(model, /COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0/);
});
