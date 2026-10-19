/** Registro persistente de simulaciones; el servidor determina usuario y fecha. */
const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/sga/audit`;

async function request(url, token, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(url, {
            ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
            cache: 'no-store', signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'No se ha podido registrar la operación. Comprueba la conexión.');
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('No se ha confirmado el registro por tiempo de espera. Detén la operación y revisa el historial.');
        throw error;
    } finally { clearTimeout(timeout); }
}

// Los identificadores no otorgan permisos: solo evitan guardar dos veces un
// mismo envío. Fallback para tablets que abren la intranet sin HTTPS.
const newEventId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const r = Math.floor(Math.random() * 16);
        return (char === 'x' ? r : ((r & 3) | 8)).toString(16);
    });
};

export const sgaAuditGateway = Object.freeze({
    record: (token, event) => request(BASE, token, { method: 'POST', body: JSON.stringify({ ...event, eventId: event.eventId || newEventId() }) }),
    list: (token, { reference = '', action = '', offset = 0, limit = 40 } = {}) => {
        const params = new URLSearchParams({ reference, action, offset: String(offset), limit: String(limit) });
        return request(`${BASE}?${params}`, token);
    },
});
