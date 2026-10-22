// Recuperación limitada para consultas de SOLO LECTURA del control de stock.
// No se reutiliza para escrituras, inicio de sesión ni modificaciones de permisos.
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS = [1000, 2500];
// No ejecutar de nuevo una consulta pesada tras agotar tiempo en el servidor.
const SLOW_FAILURE_THRESHOLD_MS = 10000;

function abortedError() {
    return new DOMException('Consulta cancelada.', 'AbortError');
}

export function waitForStockRetry(delayMs, signal) {
    if (signal?.aborted) return Promise.reject(abortedError());
    return new Promise((resolve, reject) => {
        const finish = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
        };
        const cancel = () => {
            finish();
            reject(abortedError());
        };
        const timer = setTimeout(() => {
            finish();
            resolve();
        }, delayMs);
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
    });
}

// Si la conexión permanece colgada, liberamos el intento antes de reintentar.
// Usamos un AbortController propio para NO cancelar la búsqueda del usuario al agotar
// el tiempo de un intento: sólo el AbortController exterior cancela toda la operación.
async function fetchWithAttemptTimeout(fetchImpl, url, options, timeoutMs) {
    const parentSignal = options?.signal;
    if (parentSignal?.aborted) throw abortedError();
    const attemptController = new AbortController();
    const cancel = () => attemptController.abort();
    parentSignal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => attemptController.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: attemptController.signal });
    } catch (error) {
        if (parentSignal?.aborted) throw abortedError();
        if (attemptController.signal.aborted) throw new TypeError('La consulta ha superado el tiempo de espera.');
        throw error;
    } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener('abort', cancel);
    }
}

export async function fetchStockWithRecovery(url, options, {
    fetchImpl = fetch,
    wait = waitForStockRetry,
    onRetry,
    delays = RETRY_DELAYS,
    timeoutMs = 45000,
    now = () => Date.now(),
    slowFailureThresholdMs = SLOW_FAILURE_THRESHOLD_MS,
} = {}) {
    const signal = options?.signal;

    for (let attempt = 0; ; attempt += 1) {
        if (signal?.aborted) throw abortedError();
        let retryable = false;
        let retryStatus = null;
        const startedAt = now();
        try {
            const response = await fetchWithAttemptTimeout(fetchImpl, url, options, timeoutMs);
            // Un 504/5xx tras una consulta larga apunta a saturación/timeout,
            // no a un microcorte corto. Reintentarlo multiplica trabajo en Neon.
            if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= delays.length
                || (response.status >= 500 && now() - startedAt >= slowFailureThresholdMs)) {
                return response;
            }
            retryable = true;
            retryStatus = response.status;
        } catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            // fetch rechaza con TypeError ante fallos de red / servidor inalcanzable.
            // Otros errores de programación no se reintentan silenciosamente.
            if (!(error instanceof TypeError) || attempt >= delays.length) throw error;
            if (now() - startedAt >= slowFailureThresholdMs) {
                throw new Error('La consulta de planificación tardó demasiado o el servidor interrumpió la conexión. Comprueba los registros de Vercel.');
            }
            retryable = true;
        }
        if (!retryable) break;
        onRetry?.({ attempt: attempt + 1, maxRetries: delays.length, status: retryStatus });
        await wait(delays[attempt], signal);
    }
}
