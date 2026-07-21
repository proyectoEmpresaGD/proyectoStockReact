const API_BASE = (
    import.meta.env.VITE_API_BASE_URL ||
    'http://localhost:1234'
).replace(/\/$/, '');

function requireToken(token) {
    if (!token) {
        throw new Error(
            'No hay una sesión válida. Vuelve a iniciar sesión.'
        );
    }
}

async function parseErrorResponse(
    response,
    fallbackMessage
) {
    try {
        const contentType =
            response.headers.get('content-type') || '';

        if (
            contentType.includes('application/json')
        ) {
            const data = await response.json();

            return (
                data?.error ||
                data?.message ||
                fallbackMessage
            );
        }

        const text = await response.text();

        return text || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

export async function uploadIntrastatExcel(
    file,
    tipo = 'ventas',
    mesIntrastat = '',
    token
) {
    requireToken(token);

    if (!file) {
        throw new Error(
            'Debes seleccionar un archivo Excel.'
        );
    }

    const formData = new FormData();

    formData.append('file', file);
    formData.append('tipo', tipo);
    formData.append(
        'mesIntrastat',
        mesIntrastat || ''
    );

    const response = await fetch(
        `${API_BASE}/api/intrastat/ventas`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        }
    );

    if (!response.ok) {
        const errorMessage =
            await parseErrorResponse(
                response,
                'Error generando Intrastat'
            );

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            throw new Error(
                'Tu sesión ha expirado o no tienes permisos.'
            );
        }

        throw new Error(errorMessage);
    }

    return response.json();
}

export async function getFacturasIvaIncorrectoFromExcel(
    facturas,
    token
) {
    requireToken(token);

    const response = await fetch(
        `${API_BASE}/api/intrastat/facturas-iva-incorrecto-excel`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ facturas }),
        }
    );

    if (!response.ok) {
        const errorMessage =
            await parseErrorResponse(
                response,
                'Error cargando las facturas con IVA incorrecto'
            );

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            throw new Error(
                'Tu sesión ha expirado o no tienes permisos.'
            );
        }

        throw new Error(errorMessage);
    }

    return response.json();
}

export const intrastatClient = {
    uploadIntrastatExcel,
    getFacturasIvaIncorrectoFromExcel,
};