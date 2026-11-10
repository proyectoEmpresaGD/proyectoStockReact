/** Acceptance tests only; the frontend never sees the CDI API key. */
const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/sga/cdi-test`;
async function request(path, token, { method = 'GET', body, writeRisk = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(`${BASE}${path}`, {
            method, cache: 'no-store', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            // An Express 404 (usually HTML, without our API error code) means
            // the local backend is missing this route. An ERP 404, instead,
            // arrives as JSON with a specific CDI error code and must be shown
            // without hiding its original message.
            const routeMissing = response.status === 404 && !data.code;
            const message = routeMissing
                ? 'La ruta del SGA no existe en el backend que responde en el puerto 1234. ' +
                  'Comprueba server/routes/sgaCdiTest.js y su registro en server/index.js, ' +
                  'y reinicia el backend actualizado. No modifiques la clave CDI.'
                : data.message || `La API del SGA ha respondido con HTTP ${response.status}.`;
            const error = new Error(message);
            error.code = routeMissing ? 'SGA_CDI_TEST_ROUTE_MISSING' : data.code;
            error.uncertain = Boolean(data.uncertain);
            throw error;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError' || (writeRisk && error instanceof TypeError)) {
            const uncertain = new Error('No se ha confirmado la respuesta de CDI. Consulta el MISMO ID de operación antes de intentar nada más.');
            uncertain.code = 'CDI_CLIENT_RESULT_UNCERTAIN';
            uncertain.uncertain = writeRisk;
            throw uncertain;
        }
        throw error;
    } finally { clearTimeout(timer); }
}
export const sgaCdiTestGateway = Object.freeze({
    status: (token) => request('/status', token),
    readiness: (token) => request('/readiness', token),
    recent: (token) => request('/recent', token),
    invoiceHandoffs: (token) => request('/invoice-handoffs', token),
    inspectStock: (token, data) => request('/inspect-stock', token, { method: 'POST', body: data }),
    inspect: (token, data) => request('/inspect', token, { method: 'POST', body: data }),
    checkDocument: (token, id, data) => request(`/${encodeURIComponent(id)}/check-document`, token, { method: 'POST', body: data }),
    inspectSalesOrder: (token, data) => request('/inspect-sales-order', token, { method: 'POST', body: data }),
    listSalesOrders: (token, data) => request('/list-sales-orders', token, { method: 'POST', body: data }),
    preparePicking: (token, data) => request('/prepare-picking', token, { method: 'POST', body: data }),
    readCheckpoint: (token, data) => request('/preparador/checkpoint/read', token, { method: 'POST', body: data }),
    myCheckpoints: (token) => request('/preparador/checkpoint/mine', token),
    archiveCheckpoint: (token, data) => request('/preparador/checkpoint/archive', token, { method: 'POST', body: data }),
    saveCheckpoint: (token, data) => request('/preparador/checkpoint/save', token, { method: 'POST', body: data }),
    pauseCheckpoint: (token, data) => request('/preparador/checkpoint/pause', token, { method: 'POST', body: data }),
    resumeCheckpoint: (token, data) => request('/preparador/checkpoint/resume', token, { method: 'POST', body: data }),
    preparePickingForOperator: (token, data) => request('/preparador/prepare', token, { method: 'POST', body: data }),
    prepare: (token, data) => request('/prepare', token, { method: 'POST', body: data }),
    resumePrepared: (token, id, leaseToken, reason) => request(`/${encodeURIComponent(id)}/resume-prepared`, token, { method: 'POST', body: { leaseToken, reason } }),
    pausePrepared: (token, id, leaseToken, reason) => request(`/${encodeURIComponent(id)}/pause-prepared`, token, { method: 'POST', body: { leaseToken, reason } }),
    commit: (token, id, leaseToken, approvalText = '') => request(`/${encodeURIComponent(id)}/commit`, token, { method: 'POST', writeRisk: true, body: { confirmation: 'CONFIRMAR_ESCRITURA_DE_PRUEBA', ...(leaseToken ? { leaseToken } : {}), ...(approvalText ? { approvalText } : {}) } }),
    detail: (token, id) => request(`/${encodeURIComponent(id)}`, token),
    reconcile: (token, id) => request(`/${encodeURIComponent(id)}/reconcile`, token, { method: 'POST', body: {} }),
    retry: (token, id, leaseToken, approvalText = '') => request(`/${encodeURIComponent(id)}/retry`, token, { method: 'POST', writeRisk: true, body: { confirmation: 'REINTENTAR_MISMA_OPERACION', ...(leaseToken ? { leaseToken } : {}), ...(approvalText ? { approvalText } : {}) } }),
});
