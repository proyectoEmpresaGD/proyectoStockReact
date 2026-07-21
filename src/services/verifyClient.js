// src/services/verifyClient.js

export async function verifyBatch(
    files,
    {
        token,
        ref,
        extraFields,
    } = {}
) {
    const API_BASE = (
        import.meta.env.VITE_API_BASE_URL ||
        'http://localhost:1234'
    ).replace(/\/$/, '');

    if (!token) {
        throw new Error(
            'No hay una sesión válida. Vuelve a iniciar sesión.'
        );
    }

    if (!Array.isArray(files) || files.length === 0) {
        throw new Error(
            'Debes seleccionar al menos un archivo.'
        );
    }

    const url = `${API_BASE}/api/verify/batch`;

    const guessRefFromName = (name) => {
        const base = name.replace(/\.[^.]+$/, '');

        const numericMatch = base.match(/\b\d{4,}\b/);
        const tokenMatch = base.match(/^[A-Za-z0-9_-]+/);

        return (
            numericMatch?.[0] ||
            tokenMatch?.[0] ||
            ''
        );
    };

    const formData = new FormData();

    files.forEach((file) => {
        formData.append('files', file);
        formData.append(
            'refs[]',
            guessRefFromName(file.name)
        );
    });

    if (ref) {
        formData.append('ref', ref);
    }

    if (extraFields) {
        Object.entries(extraFields).forEach(
            ([key, value]) => {
                if (
                    value !== undefined &&
                    value !== null
                ) {
                    formData.append(key, String(value));
                }
            }
        );
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const contentType =
            response.headers.get('content-type') || '';

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            throw new Error(
                'Tu sesión ha expirado o no tienes permisos.'
            );
        }

        if (
            contentType.includes('application/json')
        ) {
            const body = await response
                .json()
                .catch(() => ({}));

            throw new Error(
                body?.error ||
                body?.message ||
                `Error HTTP ${response.status}`
            );
        }

        const text = await response
            .text()
            .catch(() => '');

        throw new Error(
            `Error HTTP ${response.status}: ${text.slice(
                0,
                200
            )}`
        );
    }

    return response.json();
}