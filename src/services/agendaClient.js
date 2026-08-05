const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function buildQuery(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
        search.set(key, Array.isArray(value) ? value.join(',') : String(value));
    });
    const query = search.toString();
    return query ? `?${query}` : '';
}

async function request(path, { token = null, method = 'GET', body = undefined, signal = undefined, multipart = false } = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (!multipart && body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : (multipart ? body : JSON.stringify(body)),
        signal,
    });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        payload = await response.json().catch(() => null);
    } else if (response.status !== 204) {
        const text = await response.text().catch(() => '');
        payload = text ? { error: text } : null;
    }

    if (!response.ok) {
        const error = new Error(payload?.error || payload?.message || `Error HTTP ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

export const agendaClient = {
    overview: (token, signal) => request('/api/agenda/overview', { token, signal }),
    listVisits: (token, params = {}, signal) => request(`/api/agenda/visits${buildQuery(params)}`, { token, signal }),
    getVisit: (token, id, signal) => request(`/api/agenda/visits/${id}`, { token, signal }),
    createVisit: (token, body) => request('/api/agenda/visits', { token, method: 'POST', body }),
    createCompletedVisit: (token, body) => request('/api/agenda/visits/completed', { token, method: 'POST', body }),
    updateVisit: (token, id, body) => request(`/api/agenda/visits/${id}`, { token, method: 'PATCH', body }),
    startVisit: (token, id, signal) => request(`/api/agenda/visits/${id}/start`, { token, method: 'PATCH', signal }),
    completeVisit: (token, id, body) => request(`/api/agenda/visits/${id}/complete`, { token, method: 'PATCH', body }),
    cancelVisit: (token, id, body) => request(`/api/agenda/visits/${id}/cancel`, { token, method: 'PATCH', body }),
    reopenVisit: (token, id) => request(`/api/agenda/visits/${id}/reopen`, { token, method: 'PATCH' }),
    deleteVisit: (token, id) => request(`/api/agenda/visits/${id}`, { token, method: 'DELETE' }),
    followUps: (token, params = {}, signal) => request(`/api/agenda/followups${buildQuery(params)}`, { token, signal }),
    listReminders: (token, params = {}, signal) => request(`/api/agenda/reminders${buildQuery(params)}`, { token, signal }),
    createReminder: (token, body) => request('/api/agenda/reminders', { token, method: 'POST', body }),
    reminderAction: (token, id, action, body = {}) => request(`/api/agenda/reminders/${id}/${action}`, { token, method: 'PATCH', body }),
    deleteReminder: (token, id) => request(`/api/agenda/reminders/${id}`, { token, method: 'DELETE' }),
    adminHealth: (token, signal) => request('/api/agenda/admin/health', { token, signal }),
    adminRepair: (token, action) => request(`/api/agenda/admin/repair/${action}`, { token, method: 'POST', body: {} }),
    history: (token, params = {}, signal) => request(`/api/agenda/history${buildQuery(params)}`, { token, signal }),
    searchClients: (token, q, signal) => request(`/api/agenda/clients${buildQuery({ q, limit: 12 })}`, { token, signal }),
    team: (token, signal) => request('/api/agenda/team', { token, signal }),

    listNotes: (token, params = {}, signal) => request(`/api/notas${buildQuery(params)}`, { token, signal }),
    getNote: (token, id, signal) => request(`/api/notas/${id}`, { token, signal }),
    createNote: (token, formData) => request('/api/notas', { token, method: 'POST', body: formData, multipart: true }),
    updateNote: (token, id, formData) => request(`/api/notas/${id}`, { token, method: 'PATCH', body: formData, multipart: true }),
    deleteNote: (token, id) => request(`/api/notas/${id}`, { token, method: 'DELETE' }),
};

export default agendaClient;
