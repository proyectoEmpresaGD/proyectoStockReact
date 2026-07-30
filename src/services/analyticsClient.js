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

async function apiGet(path, params = {}, options = {}) {
    const token = localStorage.getItem('token');
    const query = buildQuery(params);
    const url = `${API_BASE}/api/analytics/${path}${query ? `?${query}` : ''}`;

    const res = await fetch(url, {
        signal: options.signal,
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
    getFilters: (params, options) => apiGet('filters', params, options),
    getDashboard: (params, options) => apiGet('dashboard', params, options),
    getSummary: (params, options) => apiGet('summary', params, options),
    getSeries: (params, options) => apiGet('series', params, options),
    getTimeseries: (params, options) => apiGet('timeseries', params, options),
    getTop: (params, options) => apiGet('top', params, options),
    getBusinessUnits: (params, options) => apiGet('business-units', params, options),
    getBusinessLines: (params, options) => apiGet('business-lines', params, options),
    getInvoices: (params, options) => apiGet('invoices', params, options),
    getDataQuality: (params, options) => apiGet('data-quality', params, options),
    getGeography: (params, options) => apiGet('geography', params, options),
    getCompliance: (params, options) => apiGet('compliance', params, options),
};
