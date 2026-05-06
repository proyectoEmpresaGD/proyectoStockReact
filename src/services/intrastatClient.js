const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:1234')
    .replace(/\/$/, '');

export async function uploadIntrastatExcel(file, tipo = 'ventas') {
    const formData = new FormData();

    formData.append('file', file);
    formData.append('tipo', tipo);

    const response = await fetch(`${API_BASE}/api/intrastat/ventas`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = 'Error Intrastat';

        try {
            const data = await response.json();
            errorMessage = data?.error || errorMessage;
        } catch {
        }

        throw new Error(errorMessage);
    }

    return response.json();
}

async function getFacturasIvaIncorrectoFromExcel(facturas) {
    const response = await fetch(
        `${API_BASE}/api/intrastat/facturas-iva-incorrecto-excel`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ facturas }),
        }
    );

    if (!response.ok) {
        throw new Error('Error cargando IVA incorrecto');
    }

    return response.json();
}

export const intrastatClient = {
    uploadIntrastatExcel,
    getFacturasIvaIncorrectoFromExcel,
};