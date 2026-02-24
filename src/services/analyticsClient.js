const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function buildQuery(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        if (Array.isArray(v)) {
            v.forEach((item) => search.append(`${k}[]`, item));
            return;
        }
        search.set(k, v);
    });
    return search.toString();
}

async function apiGet(path, params = {}) {
    const token = localStorage.getItem('token');
    const query = buildQuery(params);
    const url = `${API_BASE}/api/analytics/${path}${query ? `?${query}` : ''}`;

    const res = await fetch(url, {
        headers: {
            Authorization: token ? `Bearer ${token}` : '',
        },
    });

    if (!res.ok) {
        let payload = null;
        try {
            payload = await res.json();
        } catch {
            payload = { message: await res.text() };
        }

        const err = new Error(payload?.error || payload?.message || `Analytics error ${res.status}`);
        err.status = res.status;
        err.payload = payload;
        throw err;
    }
    return res.json();
}

export const analyticsClient = {
    getFilters: (params) => apiGet('filters', params),
    getSummary: (params) => apiGet('summary', params),
    getSeries: (params) => apiGet('series', params),
    getTimeseries: (params) => apiGet('timeseries', params),
    getTop: (params) => apiGet('top', params),
    getInvoices: (params) => apiGet('invoices', params),
    getCompliance: (params) => apiGet('compliance', params),
};
