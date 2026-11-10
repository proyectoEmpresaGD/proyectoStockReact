/**
 * Borradores LOCALES de DEMOSTRACIÓN para entradas y recuentos.
 * No son una cola de escritura, no incluyen credenciales ni autorizan movimientos CDI.
 * Una futura integración real debe guardar estados/idempotencia en el backend.
 */
export const DEMO_DRAFT_VERSION = 1;
export const DEMO_DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
const PREFIX = 'stockplus:sga:demo:v17:';
const KINDS = new Set(['recepcion', 'recuento']);

export function demoDraftKey(kind, operator, resource = 'actual') {
    if (!KINDS.has(kind) || !String(operator || '').trim() || !String(resource || '').trim()) return null;
    return PREFIX + [kind, operator, resource].map((part) => encodeURIComponent(String(part).trim())).join(':');
}

export function readDemoDraft(storage, { kind, operator, resource = 'actual', now = Date.now() } = {}) {
    const key = demoDraftKey(kind, operator, resource);
    if (!key || !storage) return null;
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (saved?.version !== DEMO_DRAFT_VERSION || saved?.kind !== kind || saved?.operator !== String(operator).trim()
            || saved?.resource !== String(resource).trim() || !Number.isSafeInteger(saved.at)
            || saved.at > now + 60_000 || now - saved.at > DEMO_DRAFT_MAX_AGE
            || !saved.data || typeof saved.data !== 'object' || Array.isArray(saved.data)) {
            storage.removeItem(key);
            return null;
        }
        return saved.data;
    } catch { return null; }
}

export function saveDemoDraft(storage, { kind, operator, resource = 'actual', data, now = Date.now() } = {}) {
    const key = demoDraftKey(kind, operator, resource);
    if (!key || !storage || !data || typeof data !== 'object' || Array.isArray(data)) return false;
    try {
        storage.setItem(key, JSON.stringify({ version: DEMO_DRAFT_VERSION, kind,
            operator: String(operator).trim(), resource: String(resource).trim(), at: now, data }));
        return true;
    } catch { return false; }
}

export function removeDemoDraft(storage, { kind, operator, resource = 'actual' } = {}) {
    const key = demoDraftKey(kind, operator, resource);
    if (!key || !storage) return false;
    try { storage.removeItem(key); return true; } catch { return false; }
}

/** Comprueba un borrador de recepción frente al pedido/catálogo de DEMOSTRACIÓN actuales. */
export function safeReceiptDraft(draft, order, products, verifyReview, getPending) {
    if (!draft || String(draft.orderId) !== String(order?.id) || !Array.isArray(draft.receipts) || !draft.receipts.length
        || draft.receipts.length > 300 || !Array.isArray(draft.issuedLots) || draft.issuedLots.length > 500) return null;
    if (!draft.receipts.every((receipt) => receipt && typeof receipt === 'object' && receipt.simulated === true)) return null;
    const allPending = getPending(order).map((line) => line.id);
    const result = verifyReview(order, draft.receipts, products, allPending);
    if (!result.ok) return null;
    return {
        receipts: draft.receipts,
        activeLineId: allPending.includes(draft.activeLineId) ? draft.activeLineId : allPending[0],
        warehouse: typeof draft.warehouse === 'string' ? draft.warehouse : '',
        location: typeof draft.location === 'string' ? draft.location : '',
        issuedLots: draft.issuedLots.filter((code) => typeof code === 'string'),
    };
}
