const buildHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
});

const buildQueryString = (params = {}) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        searchParams.set(key, value);
    });

    return searchParams.toString();
};

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL;

export async function fetchStockControlFilters({ token, signal }) {
    const response = await fetch(`${getApiBaseUrl()}/api/stock/control-stock/filters`, {
        headers: buildHeaders(token),
        signal,
    });

    if (!response.ok) {
        throw new Error('No se han podido cargar los filtros de control de stock.');
    }

    return response.json();
}

export async function fetchStockControlSuggestions({ token, query, signal }) {
    const search = String(query || '').trim();
    if (search.length < 2) return [];
    const response = await fetch(`${getApiBaseUrl()}/api/stock/control-stock/suggestions?q=${encodeURIComponent(search)}`, {
        headers: buildHeaders(token),
        cache: 'no-store',
        signal,
    });
    if (!response.ok) throw new Error('No se han podido cargar las sugerencias.');
    const suggestions = await response.json();
    return Array.isArray(suggestions) ? suggestions : [];
}

export async function fetchStockControlRows({ token, filters, signal }) {
    const query = buildQueryString(filters);
    const url = `${getApiBaseUrl()}/api/stock/control-stock${query ? `?${query}` : ''}`;

    const response = await fetch(url, {
        headers: buildHeaders(token),
        cache: 'no-store',
        signal,
    });

    if (!response.ok) {
        throw new Error('No se ha podido cargar el control de stock.');
    }

    return response.json();
}
// Usado para depurar propuestas anteriores y validar cada descarga contra la tabla productos.
export async function validateStockControlProductCodes({ token, codes, signal }) {
    const response = await fetch(`${getApiBaseUrl()}/api/stock/control-stock/validate-products`, {
        method: 'POST',
        headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
        cache: 'no-store',
        signal,
    });

    if (!response.ok) {
        throw new Error('No se ha podido comprobar si la propuesta contiene productos obsoletos.');
    }

    const data = await response.json();
    if (!Array.isArray(data?.activeCodes)) {
        throw new Error('Respuesta no válida al comprobar los productos de la propuesta.');
    }
    return data.activeCodes;
}
