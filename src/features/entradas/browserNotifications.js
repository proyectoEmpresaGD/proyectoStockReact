// Avisos opcionales del sistema operativo mientras la web permanezca abierta.
// No son push: no pueden funcionar si el navegador ha cerrado la aplicación.
const key = (user) => `cjm:entradas:desktop:v1:${user}`;

export function readDesktopPreference(user, storage = globalThis.localStorage) {
    if (!user) return false;
    try { return storage?.getItem(key(user)) === 'on'; } catch { return false; }
}

export function saveDesktopPreference(user, enabled, storage = globalThis.localStorage) {
    if (!user) return;
    try { storage?.setItem(key(user), enabled ? 'on' : 'off'); } catch { /* opcional */ }
}

export async function requestDesktopPermission(NotificationAPI = globalThis.Notification) {
    if (!NotificationAPI || !globalThis.isSecureContext) return false;
    if (NotificationAPI.permission === 'granted') return true;
    if (NotificationAPI.permission === 'denied') return false;
    try { return (await NotificationAPI.requestPermission()) === 'granted'; }
    catch { return false; }
}

export function showDesktopActivity(notices, NotificationAPI = globalThis.Notification, hostWindow = globalThis.window) {
    if (!Array.isArray(notices) || !notices.length || !NotificationAPI || NotificationAPI.permission !== 'granted') return false;
    // Un aviso por lote de novedades en vez de abrir numerosas ventanas.
    const one = notices[0];
    const title = notices.length === 1 ? 'Nueva entrada en CJM' : `${notices.length} novedades de entradas en CJM`;
    const body = notices.length === 1
        ? `${one.codprodu} · ${one.desprodu} · +${one.change.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
        : `Hay ${notices.length} referencias con nuevos registros en albaranes de compra.`;
    try {
        const notification = new NotificationAPI(title, { body, tag: 'cjm-entradas-nuevas' });
        notification.onclick = () => {
            hostWindow?.focus?.();
            if (hostWindow?.location) hostWindow.location.hash = `#/entradas?fecha=${encodeURIComponent(one.date)}&buscar=${encodeURIComponent(one.codprodu)}`;
            notification.close?.();
        };
        return true;
    } catch { return false; }
}
