const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/sga/cdi-logistics`;
const query = (data) => new URLSearchParams(Object.entries(data).filter(([,value]) => value !== '' && value != null)).toString();
async function call(token, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetch(`${BASE}${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.message || 'La operación no está disponible.'); error.code = data.code; error.uncertain = data.uncertain; throw error; }
        return data;
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('La conexión tardó demasiado. Comprueba el estado antes de volver a enviar.');
        throw e;
    } finally { clearTimeout(timeout); }
}
export const sgaCdiLogisticsGateway = Object.freeze({
    status: (t) => call(t, '/status'),
    purchases: (t, p = {}) => call(t, `/compras?${query(p)}`),
    pending: (t, p) => call(t, `/compras/pendientes?${query(p)}`),
    stock: (t, p) => call(t, `/existencias?${query(p)}`),
    mine: (t) => call(t, '/operaciones/mias'),
    prepareReceipt: (t, p) => call(t, '/compras/preparar', p),
    prepareInventory: (t, p) => call(t, '/inventario/preparar', p),
    read: (t, id) => call(t, `/operaciones/${encodeURIComponent(id)}`),
    confirm: (t, id) => call(t, `/operaciones/${encodeURIComponent(id)}/confirmar`, { confirmation: 'CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO' }),
    inspect: (t, id) => call(t, `/operaciones/${encodeURIComponent(id)}/comprobar`, {}),
});
