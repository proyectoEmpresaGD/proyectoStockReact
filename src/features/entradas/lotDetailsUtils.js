// Los lotes de stock actuales NO se identifican como los lotes que entraron
// en un albarán hasta conocer una relación ERP verificada.
export function normalizeCurrentLots(rows, requestedCode) {
    const requested = String(requestedCode ?? '').trim().toUpperCase();
    if (!requested || !Array.isArray(rows)) return [];
    return rows.filter((row) => String(row?.codprodu ?? '').trim().toUpperCase() === requested
        && String(row?.codlote ?? '').trim())
        .map((row) => ({
            codlote: String(row.codlote).trim(),
            canal: String(row.canal ?? '').trim(),
            codalmac: String(row.codalmac ?? '').trim(),
            // Son existencias ACTUALES, no cantidad recibida.
            stocktotal: amount(row.stocktotal),
            stockreservado: amount(row.stockreservado),
            stockactual: amount(row.stockactual),
        }))
        .sort((a, b) => a.codlote.localeCompare(b.codlote, 'es', { numeric: true })
            || a.codalmac.localeCompare(b.codalmac));
}

function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function receiptLineDetails(entry) {
    const seen = new Set();
    return (Array.isArray(entry?.receiptLines) ? entry.receiptLines : [])
        .filter((line) => {
            const id = String(line?.id ?? '').trim();
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .map((line) => ({
            id: String(line.id),
            document: [String(line.serieAlbaran ?? '').trim(), String(line.numeroAlbaran ?? '').trim()]
                .filter(Boolean).join(' / ') || '—',
            quantity: amount(line.quantity),
            receivedAt: typeof line.receivedAt === 'string' && Number.isFinite(Date.parse(line.receivedAt))
                ? line.receivedAt : null,
        }))
        .sort((a, b) => (b.receivedAt ? Date.parse(b.receivedAt) : 0) - (a.receivedAt ? Date.parse(a.receivedAt) : 0));
}
