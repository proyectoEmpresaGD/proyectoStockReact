/** Transportes CDI limitados al circuito logístico. Nunca usa la clave en el navegador. */
import { CdiReadError, createCdiReadOnlyClient } from './cdiReadOnlyClient.js';
import { LogisticsError } from './sgaCdiLogisticsContracts.js';
const ENDPOINT = 'https://cdicloud.es/apis/v2/ejecutar.php';
const FUNCTIONS = Object.freeze({
    documents: 'CDIGEST.CDI.documentos.listar',
    pending: 'CDIGEST.CDI.pedidos.pendientes',
    master: 'CDIGEST.CDI.maestros.obtener',
    document: 'CDIGEST.CDI.documentos.obtener',
    stock: 'CDIGEST.CDI.existencias.listar',
    receipt: 'CDIGEST.CDI.pedidos.servir',
    inventory: 'CDIGEST.CDI.stock.operaciones.guardar',
    operation: 'CDIGEST.CDI.stock.operaciones.obtener',
});
const READS = new Set(['documents', 'pending', 'document', 'stock', 'operation', 'master']);
const WRITES = new Set(['receipt', 'inventory']);
export function createSgaCdiLogisticsClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
    const prod = createCdiReadOnlyClient({ env, fetchImpl, timeoutMs });
    const company = String(env.CDI_LOGISTICS_TEST_EMPRESA || '').trim();
    const key = String(env.CDI_LOGISTICS_TEST_API_KEY || '').trim();
    const prodCompany = String(env.CDI_EMPRESA || '').trim();
    const test = /^BD\d{6}$/.test(company) && /^BD\d{6}$/.test(prodCompany) && company !== prodCompany && Boolean(key)
        && env.CDI_LOGISTICS_TEST_WRITES_ENABLED === 'true'
        && env.CDI_LOGISTICS_TEST_CONFIRMED === 'SI_EMPRESA_DE_ENSAYO';
    const status = () => ({ company: test ? company : prod.status().company, mode: test ? 'TEST_WRITE' : 'READ_ONLY',
        readsEnabled: test || (prod.status().enabled && prod.status().configured), writesEnabled: test,
        reason: test ? null : 'Entradas y regularizaciones reales desactivadas: falta una empresa CDI de ensayo autorizada.' });
    async function invoke(kind, data, idempotencyKey) {
        if (!Object.hasOwn(FUNCTIONS, kind)) throw new LogisticsError(400, 'SGA_FUNCTION_FORBIDDEN', 'Función CDI no autorizada.');
        if (WRITES.has(kind) && !test) throw new LogisticsError(403, 'SGA_WRITES_DISABLED', 'No está habilitado el entorno de ensayo de entradas y regularizaciones.');
        if (!test && READS.has(kind) && kind !== 'operation') {
            try { return await prod.read(kind, data); }
            catch (e) { if (e instanceof CdiReadError) throw new LogisticsError(e.status, e.code, e.message); throw e; }
        }
        if (!test) throw new LogisticsError(403, 'SGA_TEST_NOT_CONFIGURED', 'Esta consulta necesita CDI TEST.');
        if (WRITES.has(kind) && !/^SGA-LOG-[0-9a-f-]{36}$/i.test(idempotencyKey || '')) {
            throw new LogisticsError(400, 'SGA_NO_IDEMPOTENCY', 'Falta la clave única de operación.');
        }
        const payload = { funcion: FUNCTIONS[kind], empresa: company, datos: data };
        if (WRITES.has(kind)) payload.idempotency_key = idempotencyKey;
        let response;
        try {
            response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error', cache: 'no-store',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
        } catch { throw new LogisticsError(504, 'SGA_CDI_UNCERTAIN', 'No sabemos si CDI recibió el movimiento. No repitas el envío.', true); }
        let result;
        try {
            const limit = 2 * 1024 * 1024;
            if (Number(response.headers?.get('content-length') || 0) > limit) throw new Error('too large');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('empty');
            const blocks = []; let size = 0;
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > limit) throw new Error('too large');
                    blocks.push(value);
                }
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size); let pos = 0;
            for (const block of blocks) { bytes.set(block, pos); pos += block.byteLength; }
            result = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            throw new LogisticsError(response.ok ? 502 : response.status, 'SGA_CDI_BAD_RESPONSE',
                'CDI devolvió una respuesta que no podemos interpretar. Comprueba la operación.', response.ok || response.status >= 500);
        }
        if (!response.ok || result?.ok === false) {
            const code = String(result?.codigo ?? result?.code ?? `HTTP_${response.status}`).replace(/[^A-Z0-9_-]/gi, '').slice(0, 80);
            throw new LogisticsError(response.status || 422, code, `CDI respondió ${code}. Comprueba los datos y la actividad de la API.`, response.status >= 500);
        }
        if (result?.ok !== true) throw new LogisticsError(502, 'SGA_CDI_UNKNOWN_RESULT', 'CDI no confirmó expresamente la operación.', true);
        return result;
    }
    return Object.freeze({ status, invoke });
}
