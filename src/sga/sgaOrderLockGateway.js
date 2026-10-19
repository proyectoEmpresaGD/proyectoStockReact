/** Bloqueos centralizados en API/PostgreSQL: no contienen ni escriben movimientos de almacén. */
const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/sga/order-locks`;

async function call(path, token, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`${BASE}${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || 'No se ha podido comprobar la asignación del pedido.');
            error.status = response.status;
            error.holder = data.holder || null;
            throw error;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Tiempo de espera agotado. No se permite preparar sin confirmar el bloqueo.');
        throw error;
    } finally { clearTimeout(timeout); }
}

export const sgaOrderLockGateway = Object.freeze({
    list: (token) => call('', token),
    claim: (token, orderKey) => call('/claim', token, { orderKey }),
    renew: (token, orderKey, leaseToken) => call('/renew', token, { orderKey, token: leaseToken }),
    verify: (token, orderKey, leaseToken) => call('/verify', token, { orderKey, token: leaseToken }),
    release: (token, orderKey, leaseToken) => call('/release', token, { orderKey, token: leaseToken }),
    recover: (token, orderKey, reason) => call('/recover', token, { orderKey, reason }),
});
