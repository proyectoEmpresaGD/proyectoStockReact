/**
 * CDI acceptance tests. TEST company is preferred. An optional, explicitly
 * authorized PILOT may serve ONE predefined PC on the current CDI company.
 * Both modes are disabled by default and never expose the API key to the UI.
 */
const ENDPOINT = 'https://cdicloud.es/apis/v2/ejecutar.php';
const ALLOWED = new Set(['CDIGEST.CDI.pedidos.pendientes', 'CDIGEST.CDI.pedidos.servir', 'CDIGEST.CDI.documentos.obtener', 'CDIGEST.CDI.documentos.listar', 'CDIGEST.CDI.existencias.listar']);
const MAX_RESPONSE_BYTES = 1024 * 1024;

export class CdiTestError extends Error {
    constructor(status, code, message, { uncertain = false, retryAfter = null } = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.uncertain = uncertain;
        this.retryAfter = retryAfter;
    }
}

async function safeJson(response) {
    if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) {
        throw new CdiTestError(502, 'CDI_TEST_RESPONSE_TOO_LARGE', 'Respuesta CDI demasiado grande.', { uncertain: true });
    }
    if (!response.body) throw new CdiTestError(502, 'CDI_TEST_NO_RESPONSE', 'CDI no ha enviado una respuesta.', { uncertain: true });
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_RESPONSE_BYTES) {
                throw new CdiTestError(502, 'CDI_TEST_RESPONSE_TOO_LARGE', 'Respuesta CDI demasiado grande.', { uncertain: true });
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new CdiTestError(502, 'CDI_TEST_INVALID_JSON', 'Respuesta CDI no interpretable.', { uncertain: true }); }
}

export function createCdiTestClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
    const company = String(env.CDI_TEST_EMPRESA || '').trim();
    const production = String(env.CDI_EMPRESA || '').trim();
    const key = String(env.CDI_TEST_API_KEY || '').trim();
    const isolated = /^BD[0-9]{6}$/.test(company) && /^BD[0-9]{6}$/.test(production) && company !== production;
    const testRequested = env.CDI_TEST_WRITES_ENABLED === 'true';
    const testEnabled = testRequested
        && env.CDI_TEST_ENVIRONMENT_CONFIRMED === 'SI_ENTORNO_DE_PRUEBAS'
        && isolated && Boolean(key);
    // Explicit opt-in in backend. Never switch from TEST to production silently.
    const pilotParts = String(env.CDI_PILOT_ORDER || '').split('|');
    const pilotOrder = pilotParts.length === 4 && pilotParts[0] === 'PC'
        && /^\d{4}$/.test(pilotParts[1])
        && /^[A-Za-z0-9._/-]{1,5}$/.test(pilotParts[2])
        && /^[A-Za-z0-9._/-]{1,10}$/.test(pilotParts[3])
        ? { tipo: pilotParts[0], anio: pilotParts[1], serie: pilotParts[2], clave: pilotParts[3] } : null;
    const pilotEnabled = !testRequested && env.CDI_PILOT_WRITES_ENABLED === 'true'
        && env.CDI_PILOT_PRODUCTION_CONFIRMED === 'ACEPTO_ALBARAN_REAL_EN_PRODUCCION'
        && env.CDI_PILOT_EMPRESA === production && env.CDI_READ_ENABLED === 'true'
        && /^BD[0-9]{6}$/.test(production) && Boolean(String(env.CDI_API_KEY || '').trim()) && Boolean(pilotOrder);
    const enabled = testEnabled || pilotEnabled;
    const pilot = pilotEnabled;
    const activeCompany = testEnabled ? company : pilotEnabled ? production : null;
    const activeKey = testEnabled ? key : pilotEnabled ? String(env.CDI_API_KEY).trim() : '';
    function assertPilotOrder(value) {
        if (!pilot) return;
        if (!value || ['tipo', 'anio', 'serie', 'clave'].some((part) => String(value[part] ?? '') !== pilotOrder[part])) {
            throw new CdiTestError(403, 'CDI_PILOT_ORDER_FORBIDDEN',
                'Solo se puede generar un AC para el pedido PC expresamente autorizado en el backend.');
        }
    }
    function status() {
        return {
            enabled, isolated: testEnabled && isolated, pilot,
            testCompany: activeCompany, company: activeCompany, allowedOrder: pilot ? pilotOrder : null,
            mode: pilot ? 'PILOT_REAL_ORDER' : 'TEST_COMPANY_ONLY',
            writesEnabled: enabled,
            reason: enabled ? null : 'Las escrituras siguen cerradas: configura empresa TEST o habilita expresamente un único pedido PILOTO desde el backend.'
        };
    }
    async function invoke(funcion, datos, idempotencyKey) {
        if (!ALLOWED.has(funcion)) throw new CdiTestError(400, 'CDI_TEST_FUNCTION_FORBIDDEN', 'Función no autorizada para estas pruebas.');
        if (!enabled) throw new CdiTestError(503, 'CDI_TEST_DISABLED', 'Escrituras de prueba desactivadas o empresa de ensayo sin configurar.');
        if (funcion.endsWith('.servir') && !/^SGA-TEST-[0-9a-f-]{36}$/i.test(idempotencyKey || '')) {
            throw new CdiTestError(400, 'CDI_TEST_IDEMPOTENCY_REQUIRED', 'Falta la clave persistida de idempotencia.');
        }
        // Last line of defence: no other ERP order can be served in pilot mode,
        // even if an old laboratory route or client sends a forged request.
        if (funcion.endsWith('.servir')) assertPilotOrder(datos);
        const payload = { funcion, empresa: activeCompany, datos };
        if (idempotencyKey) payload.idempotency_key = idempotencyKey;
        let response;
        try {
            response = await fetchImpl(ENDPOINT, {
                method: 'POST', redirect: 'error', cache: 'no-store',
                headers: { Authorization: `Bearer ${activeKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new CdiTestError(504, 'CDI_TEST_TRANSPORT_UNCERTAIN', 'CDI no ha confirmado el resultado; no generes otra operación.', { uncertain: true });
        }
        let result;
        try { result = await safeJson(response); }
        catch (error) {
            // Algunos proxies responden 401/403/429 con HTML o texto. Conservar el
            // HTTP permite explicar el problema y respetar Retry-After sin declarar
            // un rechazo conocido como un envío de estado incierto.
            if (!response.ok) {
                const status = response.status || 502;
                const retry = response.headers.get('retry-after');
                throw new CdiTestError(status, `CDI_HTTP_${status}`,
                    `CDI ha respondido con HTTP ${status}. Revisa autorización, permisos o límites antes de repetir.`, {
                        uncertain: status >= 500,
                        retryAfter: status === 429 && /^\d{1,4}$/.test(retry || '') ? retry : null,
                    });
            }
            throw error;
        }
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new CdiTestError(502, 'CDI_TEST_BAD_RESPONSE', 'CDI ha devuelto una estructura inesperada.', { uncertain: true });
        }
        if (!response.ok || result.ok === false) {
            const code = String(result.codigo || `CDI_HTTP_${response.status}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
            const retry = response.headers.get('retry-after');
            throw new CdiTestError(response.status || 502, code,
                `CDI rechazó o no pudo confirmar la operación (${code}).`, {
                    uncertain: response.status >= 500,
                    retryAfter: response.status === 429 && /^\d{1,4}$/.test(retry || '') ? retry : null,
                });
        }
        return result;
    }
    return Object.freeze({ status, invoke, assertPilotOrder });
}
