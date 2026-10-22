// La consulta de stock presenta existencias actuales, no cantidades recibidas.
// Hasta confirmar la trazabilidad del ERP, NUNCA marcamos un lote como recibido.
export function normalizeCurrentLots(rows, requestedCode) {
    const requested = String(requestedCode ?? '').trim().toUpperCase();
    if (!requested || !Array.isArray(rows)) return [];
    return rows.filter((row) => String(row?.codprodu ?? '').trim().toUpperCase() === requested
        && String(row?.codlote ?? '').trim())
        .map((row) => ({
            codlote: String(row.codlote).trim(),
            canal: String(row.canal ?? '').trim(),
            codalmac: String(row.codalmac ?? '').trim(),
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

// Los tejidos (codtipo 101) se gestionan en metros en CJM.
// No poner "m" a libros, perchas u otros tipos cuya unidad es diferente.
export function receivedUnit(entry) {
    return String(entry?.productType ?? '').trim() === '101' ? 'm' : '';
}

// Stock total ACTUAL en el almacén consultado, no stock recibido hoy.
export function summarizeCurrentLots(lots) {
    return (Array.isArray(lots) ? lots : []).reduce((result, lot) => ({
        total: result.total + amount(lot.stocktotal),
        reserved: result.reserved + amount(lot.stockreservado),
        available: result.available + amount(lot.stockactual),
    }), { total: 0, reserved: 0, available: 0 });
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

// Solo se puede marcar un lote recibido cuando una fuente del ERP haya
// devuelto la relación código de lote <-> albarán y la haya verificado.
// Ni fecultmod ni el stock actual prueban esa relación.
export function getVerifiedReceiptLots(entry, currentLots) {
    if (entry?.lotLinkVerified !== true || !Array.isArray(entry?.receivedLots)) return [];
    const known = new Set((Array.isArray(currentLots) ? currentLots : [])
        .map((lot) => `${String(lot.codalmac).trim()}|${String(lot.canal).trim()}|${String(lot.codlote).trim()}`));
    const ids = new Set();
    for (const item of entry.receivedLots) {
        const key = `${String(item?.codalmac ?? '').trim()}|${String(item?.canal ?? '').trim()}|${String(item?.codlote ?? '').trim()}`;
        if (known.has(key)) ids.add(key);
    }
    return [...ids];
}
