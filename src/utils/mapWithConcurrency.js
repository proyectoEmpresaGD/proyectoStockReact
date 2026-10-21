/**
 * Ejecuta lecturas independientes con concurrencia acotada y devuelve los
 * resultados en el mismo orden que la entrada. No altera los datos calculados.
 * `mapper` controla sus errores y cualquier señal AbortSignal de sus peticiones.
 */
export async function mapWithConcurrency(items, maxConcurrent, mapper) {
    if (!Array.isArray(items)) throw new TypeError('items debe ser un array');
    if (typeof mapper !== 'function') throw new TypeError('mapper debe ser una función');
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
        throw new RangeError('maxConcurrent debe ser un entero positivo');
    }

    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, items.length) }, worker));
    return results;
}
