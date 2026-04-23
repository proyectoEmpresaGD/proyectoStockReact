const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:1234').replace(/\/$/, '');

async function generarIntrastatVentas({ file }) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/intrastat/ventas`, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.error || 'Error Intrastat');
    }

    return data;
}

async function getFacturasIvaIncorrectoFromExcel(facturas) {
    const res = await fetch(
        `${API_BASE}/api/intrastat/facturas-iva-incorrecto-excel`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ facturas })
        }
    );

    if (!res.ok) {
        throw new Error('Error cargando IVA incorrecto');
    }

    return res.json();
}

export const intrastatClient = {
    generarIntrastatVentas,
    getFacturasIvaIncorrectoFromExcel
};