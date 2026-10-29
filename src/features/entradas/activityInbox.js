// Buzón persistente por usuario y navegador. No sustituye a un historial del servidor:
// localStorage puede borrarse y por ello limitamos su tamaño de forma explícita.
export const MAX_INBOX_NOTICES = 2000;
export const inboxKey = (user) => `cjm:entradas:buzon:v1:${user}`;
export const monitorKey = (user) => `cjm:entradas:ultima-consulta:v1:${user}`;

export function mergeInbox(existing, incoming, limit = MAX_INBOX_NOTICES) {
    const byId = new Map();
    for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
        if (!item || typeof item.id !== 'string' || !item.id) continue;
        const previous = byId.get(item.id);
        // Un aviso leído jamás debe volver a ser pendiente al sincronizar otra pestaña.
        byId.set(item.id, previous ? { ...previous, ...item, read: Boolean(previous.read || item.read) } : { ...item });
    }
    const newestFirst = (items) => items.sort((a, b) =>
        (Date.parse(b.detectedAt) || 0) - (Date.parse(a.detectedAt) || 0)
        || String(b.id).localeCompare(String(a.id)));
    const sorted = newestFirst([...byId.values()]);
    if (sorted.length <= limit) return sorted;
    // Antes de descartar el histórico más antiguo, proteger los pendientes.
    // El límite finito evita errores de cuota localStorage con años de avisos.
    const pending = sorted.filter((item) => !item.read).slice(0, limit);
    return newestFirst([...pending, ...sorted.filter((item) => item.read).slice(0, limit - pending.length)]);
}

export function readInbox(user, storage) {
    if (!user) return [];
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        const stored = JSON.parse(target?.getItem(inboxKey(user)) || '[]');
        return mergeInbox([], stored);
    } catch { return []; }
}

export function saveInbox(user, notices, storage) {
    if (!user) return false;
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        target?.setItem(inboxKey(user), JSON.stringify(mergeInbox([], notices)));
        return true;
    } catch { return false; }
}

export function readMonitorDate(user, storage) {
    if (!user) return null;
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        const value = target?.getItem(monitorKey(user));
        return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null;
    } catch { return null; }
}

export function saveMonitorDate(user, date, storage) {
    if (!user || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        const previous = readMonitorDate(user, target);
        if (!previous || previous < date) target?.setItem(monitorKey(user), date);
    } catch { /* La vigilancia en memoria puede continuar aunque el almacenamiento falle. */ }
}

// Revisa hasta siete fechas anteriores cuando el usuario vuelve a abrir la web.
// No presupone que el browser pueda vigilar entradas con el navegador cerrado.
export function datesToRecover(lastDate, currentDate, maxDays = 7) {
    if (!lastDate || !currentDate || lastDate >= currentDate) return [];
    const current = new Date(`${currentDate}T12:00:00Z`);
    const previous = new Date(`${lastDate}T12:00:00Z`);
    if (!Number.isFinite(current.getTime()) || !Number.isFinite(previous.getTime())) return [];
    const days = [];
    const start = new Date(Math.max(previous.getTime(), current.getTime() - maxDays * 86400000));
    for (let ms = start.getTime(); ms < current.getTime(); ms += 86400000) {
        days.push(new Date(ms).toISOString().slice(0, 10));
    }
    return days;
}

// Migración sin alertas ni sonido: conservar avisos de las fechas ya guardadas
// por versiones anteriores, cuyo contador se reiniciaba al cambiar de día.
export function readLegacyDailyNotices(user, storage) {
    if (!user) return [];
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        const prefixes = [
            `cjm:stock-activity:recepciones-v1:${user}:`,
            `cjm:stock-activity:v1:${user}:`,
        ];
        const found = [];
        for (let i = 0; i < (target?.length || 0); i += 1) {
            const key = target.key(i);
            if (!prefixes.some((prefix) => key?.startsWith(prefix))) continue;
            try {
                const parsed = JSON.parse(target.getItem(key));
                if (Array.isArray(parsed?.notifications)) found.push(...parsed.notifications);
            } catch { /* Un valor de otra versión no debe bloquear la migración. */ }
        }
        return mergeInbox([], found);
    } catch { return []; }
}
