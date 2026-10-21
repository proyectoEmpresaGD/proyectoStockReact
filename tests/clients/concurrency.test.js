import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../../src/utils/mapWithConcurrency.js';

test('se conserva el orden de resultados independientemente del orden de resolución', async () => {
    const output = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
        await new Promise((resolve) => setTimeout(resolve, n * 2));
        return n * 10;
    });
    assert.deepEqual(output, [30, 10, 20]);
});

test('nunca inicia más peticiones simultáneas que el límite establecido', async () => {
    let inFlight = 0;
    let peak = 0;
    const output = await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (n) => {
        inFlight++;
        peak = Math.max(inFlight, peak);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return n;
    });
    assert.deepEqual(output, Array.from({ length: 20 }, (_, i) => i));
    assert.equal(peak, 4);
});

test('maneja entradas vacías y parámetros erróneos sin ejecutar peticiones', async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, () => { throw Error('No ejecutar'); }), []);
    await assert.rejects(() => mapWithConcurrency([1], 0, () => 1), /entero positivo/);
});
