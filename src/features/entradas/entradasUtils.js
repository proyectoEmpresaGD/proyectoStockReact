// Utilidades puras: la fuente actual recoge modificaciones de stock,
// no recepciones confirmadas. Nunca inferir de estos campos "lote recibido".
export const localISODate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Fecha comercial de la empresa: el navegador puede estar fuera de España.
export const madridISODate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const value = (kind) => parts.find((part) => part.type === kind)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
};

export const offsetLocalDate = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(year, month - 1, day, 12);
    value.setDate(value.getDate() + days);
    return localISODate(value);
};

export const quantityOf = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const validTimestamp = (value) => {
    if (!value) return 0;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : 0;
};

export function groupEntries(rows) {
    const grouped = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const codprodu = String(row?.codprodu ?? '').trim();
        if (!codprodu) continue;
        const key = codprodu.toUpperCase();
        const current = grouped.get(key);
        const value = quantityOf(row?.cancompra);
        const timestamp = validTimestamp(row?.fecultmod);
        if (!current) {
            grouped.set(key, {
                codprodu,
                desprodu: String(row?.desprodu ?? '').trim() || 'Sin descripción',
                quantity: value,
                updatedAt: timestamp ? row.fecultmod : null,
                timestamp,
                recordCount: 1,
            });
        } else {
            current.quantity += value;
            current.recordCount += 1;
            if (timestamp > current.timestamp) {
                current.timestamp = timestamp;
                current.updatedAt = row.fecultmod;
            }
        }
    }
    return [...grouped.values()].sort((a, b) => b.timestamp - a.timestamp || a.codprodu.localeCompare(b.codprodu));
}

// Cabeceras y líneas de COMPRA acreditadas por una configuración verificada:
// conservamos sus IDs estables, no inferimos nuevas entradas por cancompra.
export function groupConfirmedReceipts(rows) {
    const grouped = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const code = String(row?.codprodu ?? '').trim();
        const lineId = String(row?.receiptLineId ?? '').trim();
        if (!code || !lineId) continue;
        const key = code.toUpperCase();
        const amount = quantityOf(row.cantidad);
        const timestamp = validTimestamp(row.receivedAt);
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                codprodu: code,
                desprodu: String(row.desprodu || 'Sin descripción').trim(),
                quantity: amount,
                updatedAt: row.receivedAt || null,
                timestamp,
                firstTimestamp: timestamp,
                recordCount: 1,
                receiptLines: [{ id: lineId, quantity: amount, serieAlbaran: String(row.serieAlbaran || '').trim(), numeroAlbaran: String(row.numeroAlbaran || '').trim(), receivedAt: row.receivedAt || null }],
                receiptDocuments: [String(row.serieAlbaran || '') + String(row.numeroAlbaran || '')],
            });
        } else if (!existing.receiptLines.some((line) => line.id === lineId)) {
            existing.quantity += amount;
            existing.recordCount += 1;
            existing.receiptLines.push({ id: lineId, quantity: amount, serieAlbaran: String(row.serieAlbaran || '').trim(), numeroAlbaran: String(row.numeroAlbaran || '').trim(), receivedAt: row.receivedAt || null });
            const doc = String(row.serieAlbaran || '') + String(row.numeroAlbaran || '');
            if (!existing.receiptDocuments.includes(doc)) existing.receiptDocuments.push(doc);
            if (timestamp && (!existing.firstTimestamp || timestamp < existing.firstTimestamp)) {
                existing.firstTimestamp = timestamp;
            }
            if (timestamp > existing.timestamp) {
                existing.timestamp = timestamp;
                existing.updatedAt = row.receivedAt;
            }
        }
    }
    return sortStockActivity([...grouped.values()], 'recent');
}

export function collectReceiptIds(entries) {
    return (Array.isArray(entries) ? entries : []).flatMap((row) =>
        (row.receiptLines || []).map((line) => `${row.codprodu.toUpperCase()}|${line.id}`));
}

export function detectNewReceipts(previousIds, entries, date, detectedAt = new Date().toISOString()) {
    if (!Array.isArray(previousIds)) return [];
    const known = new Set(previousIds);
    return (Array.isArray(entries) ? entries : []).flatMap((row) => {
        const newlyReceived = (row.receiptLines || []).filter((line) =>
            !known.has(`${row.codprodu.toUpperCase()}|${line.id}`));
        if (!newlyReceived.length) return [];
        return [{
            id: `${date}:${row.codprodu.toUpperCase()}:${newlyReceived.map((line) => line.id).sort().join(',')}`,
            date, codprodu: row.codprodu, desprodu: row.desprodu,
            change: newlyReceived.reduce((sum, line) => sum + line.quantity, 0),
            kind: 'receipt', detectedAt, read: false,
        }];
    });
}

export function makeSnapshot(entries) {
    const result = {};
    for (const row of entries) result[row.codprodu.toUpperCase()] = row.quantity;
    return result;
}

// Solo nuevas referencias en la fecha y aumentos de la cantidad registrada.
// No notifica correcciones negativas ni cambios de marca de tiempo sin cantidad.
export function detectIncreases(previousSnapshot, entries, date, detectedAt = new Date().toISOString()) {
    if (!previousSnapshot || typeof previousSnapshot !== 'object') return [];
    return entries.flatMap((row) => {
        const code = row.codprodu.toUpperCase();
        const previous = Object.prototype.hasOwnProperty.call(previousSnapshot, code)
            ? quantityOf(previousSnapshot[code]) : null;
        const delta = previous === null ? row.quantity : row.quantity - previous;
        if (delta <= 0) return [];
        return [{
            id: `${date}:${code}:${row.quantity}`,
            date,
            codprodu: row.codprodu,
            desprodu: row.desprodu,
            change: delta,
            kind: previous === null ? 'new-reference' : 'increase',
            // Momento de la detección en este navegador, NO de la recepción del lote.
            detectedAt,
            read: false,
        }];
    });
}

export function normalizeStoredActivity(value, date) {
    if (!value || value.date !== date) return { date, snapshot: null, notifications: [] };
    return {
        date,
        snapshot: value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : null,
        notifications: Array.isArray(value.notifications) ? value.notifications.slice(0, 40) : [],
        receiptIds: Array.isArray(value.receiptIds) ? value.receiptIds : null,
    };
}

export function updateStoredActivity(previous, entries, date, receiptMode = false) {
    const current = normalizeStoredActivity(previous, date);
    const isReceiptMode = receiptMode || entries.some((row) => Array.isArray(row.receiptLines));
    const newNotifications = isReceiptMode
        ? detectNewReceipts(current.receiptIds, entries, date)
        : detectIncreases(current.snapshot, entries, date);
    const seen = new Set(current.notifications.map((item) => item.id));
    const additions = newNotifications.filter((item) => !seen.has(item.id));
    return {
        date,
        snapshot: makeSnapshot(entries),
        receiptIds: isReceiptMode ? collectReceiptIds(entries) : null,
        notifications: [...additions, ...current.notifications].slice(0, 40),
    };
}

export const normalizeSearch = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Ordenación de la fuente actual: fecultmod es una modificación de stock,
// NO la hora de recepción. Cuando dispongamos de eventos de recepción
// confirmados, el orden deberá utilizar explícitamente su marca temporal.
// No altera el orden original de `entries` ni sitúa registros sin fecha
// por encima de los fechados al invertir la ordenación.
export function sortStockActivity(entries, order = 'recent') {
    const result = Array.isArray(entries) ? [...entries] : [];
    const byReference = (a, b) => String(a.codprodu ?? '').localeCompare(String(b.codprodu ?? ''));
    if (order === 'quantity') {
        return result.sort((a, b) => quantityOf(b.quantity) - quantityOf(a.quantity) || byReference(a, b));
    }
    if (order === 'code') return result.sort(byReference);
    const ascending = order === 'oldest';
    return result.sort((a, b) => {
        const candidateA = ascending && Array.isArray(a.receiptLines) ? a.firstTimestamp : a.timestamp;
        const candidateB = ascending && Array.isArray(b.receiptLines) ? b.firstTimestamp : b.timestamp;
        const aTime = Number(candidateA) > 0 && Number.isFinite(Number(candidateA)) ? Number(candidateA) : null;
        const bTime = Number(candidateB) > 0 && Number.isFinite(Number(candidateB)) ? Number(candidateB) : null;
        if (aTime === null && bTime !== null) return 1;
        if (bTime === null && aTime !== null) return -1;
        if (aTime !== null && bTime !== null && aTime !== bTime) {
            return ascending ? aTime - bTime : bTime - aTime;
        }
        return byReference(a, b);
    });
}
