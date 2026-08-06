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

export async function fetchStockControlFilters({ token }) {
    const response = await fetch(`${getApiBaseUrl()}/api/stock/control-stock/filters`, {
        headers: buildHeaders(token),
    });

    if (!response.ok) {
        throw new Error('No se han podido cargar los filtros de control de stock.');
    }

    return response.json();
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