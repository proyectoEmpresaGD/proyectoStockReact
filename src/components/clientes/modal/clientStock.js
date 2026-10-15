// Evita transferir el inventario completo para cada ficha de cliente.
export async function getClientStock(codes, token, signal) {
    const unique = [...new Set(codes.map((code) => String(code ?? '').trim()).filter(Boolean))];
    if (!unique.length) return [];
    const chunks = [];
    for (let i = 0; i < unique.length; i += 1000) chunks.push(unique.slice(i, i + 1000));
    const pages = await Promise.all(chunks.map(async (chunk) => {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock/client-products`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ codes: chunk }),
            signal,
        });
        if (!response.ok) throw new Error('No se pudo consultar el stock del cliente.');
        return response.json();
    }));
    return pages.flat();
}
