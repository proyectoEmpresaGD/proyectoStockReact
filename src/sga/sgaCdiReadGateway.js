/** Consultas ERP CDI: nunca hay escrituras ni credenciales CDI en el navegador. */
const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/sga/cdi`;

async function call(path, token, { method = 'GET', timeout = 15000 } = {}) {
    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(`${BASE}${path}`, {
            method,
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || 'No se ha podido completar la consulta CDI.');
            error.status = response.status;
            error.code = data.code;
            throw error;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('La consulta CDI ha agotado el tiempo de espera.');
        throw error;
    } finally { clearTimeout(handle); }
}

const query = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    return search.toString();
};

export const sgaCdiReadGateway = Object.freeze({
    status: (token) => call('/status', token),
    validateArticle: (token, params) => call(`/validacion/articulo?${query(params)}`, token),
    validateOrder: (token, params) => call(`/validacion/pedido?${query(params)}`, token),
    catalog: (token) => call('/catalog', token, { method: 'POST' }),
    masters: (token, params) => call(`/maestros?${query(params)}`, token),
    documents: (token, params) => call(`/documentos?${query(params)}`, token),
    document: (token, params) => call(`/documentos/detalle?${query(params)}`, token),
    pending: (token, params) => call(`/pedidos/pendientes?${query(params)}`, token),
    stock: (token, params) => call(`/existencias?${query(params)}`, token),
});
