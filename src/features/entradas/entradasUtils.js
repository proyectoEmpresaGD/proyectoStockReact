// Utilidades puras: la fuente actual recoge modificaciones de stock,
// no recepciones confirmadas. Nunca inferir de estos campos "lote recibido".
export const localISODate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    };
}

export function updateStoredActivity(previous, entries, date) {
    const current = normalizeStoredActivity(previous, date);
    const newNotifications = detectIncreases(current.snapshot, entries, date);
    const seen = new Set(current.notifications.map((item) => item.id));
    const additions = newNotifications.filter((item) => !seen.has(item.id));
    return {
        date,
        snapshot: makeSnapshot(entries),
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
        const aTime = Number(a.timestamp) > 0 && Number.isFinite(Number(a.timestamp)) ? Number(a.timestamp) : null;
        const bTime = Number(b.timestamp) > 0 && Number.isFinite(Number(b.timestamp)) ? Number(b.timestamp) : null;
        if (aTime === null && bTime !== null) return 1;
        if (bTime === null && aTime !== null) return -1;
        if (aTime !== null && bTime !== null && aTime !== bTime) {
            return ascending ? aTime - bTime : bTime - aTime;
        }
        return byReference(a, b);
    });
}
