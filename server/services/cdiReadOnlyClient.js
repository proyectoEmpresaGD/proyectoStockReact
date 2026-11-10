/**
 * CDI Gest ERP API v2 — fase de lectura únicamente.
 * NO exporta métodos de escritura, y el endpoint está fijado para evitar SSRF.
 * Contratos: REFERENCIA_API_ERP.json y GUIA_JCM_INTEGRACION_API.md (CDI Sistemas).
 */
const CDI_ENDPOINT = 'https://cdicloud.es/apis/v2/ejecutar.php';
const READ_FUNCTIONS = Object.freeze({
    catalog: 'api.catalogo',
    masters: 'CDIGEST.CDI.maestros.listar',
    master: 'CDIGEST.CDI.maestros.obtener',
    documents: 'CDIGEST.CDI.documentos.listar',
    document: 'CDIGEST.CDI.documentos.obtener',
    pending: 'CDIGEST.CDI.pedidos.pendientes',
    stock: 'CDIGEST.CDI.existencias.listar',
});
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export class CdiReadError extends Error {
    constructor(status, code, message, retryAfter = null) {
        super(message);
        this.name = 'CdiReadError';
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}

async function readLimitedJson(response) {
    if (Number(response.headers.get('content-length') || 0) > RESPONSE_LIMIT_BYTES) {
        throw new CdiReadError(502, 'CDI_RESPONSE_TOO_LARGE', 'La respuesta de CDI supera el límite permitido.');
    }
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > RESPONSE_LIMIT_BYTES) throw new CdiReadError(502, 'CDI_RESPONSE_TOO_LARGE', 'La respuesta de CDI supera el límite permitido.');
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    try {
        const data = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder().decode(data));
    } catch {
        throw new CdiReadError(502, 'CDI_INVALID_JSON', 'CDI ha devuelto una respuesta no válida.');
    }
}

/** Inyectable en pruebas: nunca contacta CDI sin configuración y habilitación expresas. */
export function createCdiReadOnlyClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
    const enabled = env.CDI_READ_ENABLED === 'true';
    const apiKey = String(env.CDI_API_KEY || '').trim();
    const company = String(env.CDI_EMPRESA || '').trim();
    const configured = Boolean(apiKey && /^BD[0-9]{6}$/.test(company));

    function status() {
        return { enabled, configured, mode: 'READ_ONLY', company: configured ? company : null, writesEnabled: false };
    }

    async function read(kind, data) {
        if (!Object.hasOwn(READ_FUNCTIONS, kind)) {
            throw new CdiReadError(400, 'CDI_READ_NOT_ALLOWED', 'Esta función no está autorizada en el conector de lectura.');
        }
        if (!enabled || !configured) {
            throw new CdiReadError(503, 'CDI_NOT_CONFIGURED', 'La conexión CDI de solo lectura está desactivada o incompleta.');
        }
        const payload = { funcion: READ_FUNCTIONS[kind] };
        if (kind !== 'catalog') {
            payload.empresa = company;
            payload.datos = data;
        }
        try {
            const response = await fetchImpl(CDI_ENDPOINT, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
                redirect: 'error',
                cache: 'no-store',
                signal: AbortSignal.timeout(timeoutMs),
            });
            const result = await readLimitedJson(response);
            if (!response.ok || result?.ok === false) {
                const code = String(result?.codigo || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
                const retryValue = response.headers.get('retry-after');
                const retryAfter = response.status === 429 && /^\d{1,4}$/.test(retryValue || '') ? retryValue : null;
                throw new CdiReadError(response.status === 429 ? 503 : 502,
                    code || `CDI_HTTP_${response.status}`,
                    response.status === 429 ? 'CDI ha limitado las solicitudes. Reintenta más tarde.'
                        : `CDI no ha podido completar la lectura${code ? ` (${code})` : ''}.`, retryAfter);
            }
            if (!result || typeof result !== 'object' || Array.isArray(result)) {
                throw new CdiReadError(502, 'CDI_INVALID_RESPONSE', 'La estructura de la respuesta CDI no es válida.');
            }
            return result;
        } catch (error) {
            if (error instanceof CdiReadError) throw error;
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                throw new CdiReadError(504, 'CDI_TIMEOUT', 'Se ha agotado el tiempo de consulta a CDI.');
            }
            throw new CdiReadError(503, 'CDI_UNREACHABLE', 'No se ha podido contactar con CDI.');
        }
    }

    return Object.freeze({ status, read });
}
