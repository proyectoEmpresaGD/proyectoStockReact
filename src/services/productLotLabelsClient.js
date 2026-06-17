const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL;

const buildHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
});

const parseResponse = async (response, defaultErrorMessage) => {
    if (!response.ok) {
        let errorMessage = defaultErrorMessage;

        try {
            const data = await response.json();
            errorMessage = data?.error || data?.message || errorMessage;
        } catch {
            // Mantiene el mensaje por defecto.
        }

        throw new Error(errorMessage);
    }

    return response.json();
};

export const searchProducts = async ({ query, token, limit = 10 }) => {
    const normalizedQuery = String(query || '').trim();

    if (!normalizedQuery) return [];

    const params = new URLSearchParams({
        query: normalizedQuery,
        limit: String(limit),
    });

    const response = await fetch(`${getApiBaseUrl()}/api/products/search?${params.toString()}`, {
        headers: buildHeaders(token),
    });

    return parseResponse(response, 'No se pudieron buscar productos');
};

export const getProductByCode = async ({ codprodu, token }) => {
    const productCode = String(codprodu || '').trim();

    if (!productCode) {
        throw new Error('Código de producto no informado');
    }

    const response = await fetch(`${getApiBaseUrl()}/api/products/${encodeURIComponent(productCode)}`, {
        headers: buildHeaders(token),
    });

    return parseResponse(response, 'No se pudo cargar el producto');
};

export const getLotsByProductCode = async ({ codprodu, token, almacenes = [0] }) => {
    const productCode = String(codprodu || '').trim();

    if (!productCode) {
        throw new Error('Código de producto no informado');
    }

    const params = new URLSearchParams();

    if (Array.isArray(almacenes) && almacenes.length > 0) {
        params.set('alm', almacenes.join(','));
    }

    const queryString = params.toString();

    const url = `${getApiBaseUrl()}/api/stocklotes/stocklotes/${encodeURIComponent(productCode)}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
        headers: buildHeaders(token),
    });

    return parseResponse(response, 'No se pudieron cargar los lotes del producto');
};

export const getProductFilters = async ({ token }) => {
    const response = await fetch(`${getApiBaseUrl()}/api/products/filters`, {
        headers: buildHeaders(token),
    });

    return parseResponse(response, 'No se pudieron cargar los filtros de productos');
};

export const filterProductsByCollection = async ({ collection, token }) => {
    const normalizedCollection = String(collection || '').trim();

    if (!normalizedCollection) return [];

    const response = await fetch(`${getApiBaseUrl()}/api/products/filter`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({
            collection: [normalizedCollection],
        }),
    });

    return parseResponse(response, 'No se pudieron cargar productos de la colección');
};