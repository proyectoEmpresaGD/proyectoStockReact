import { isIP } from 'node:net';

// Solo recursos públicos autorizados: /api/proxy lo usan etiquetas HTML <img>
// que no pueden enviar la cabecera Authorization.
const DEFAULT_HOSTS = ['bassari.eu', 'www.bassari.eu'];
export const MAX_PROXY_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_PROXY_TIMEOUT_MS = 15000;
const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/avif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon'
]);

export function parseAllowedImageProxyUrl(raw, hostsSetting = process.env.IMAGE_PROXY_ALLOWED_HOSTS) {
    if (typeof raw !== 'string' || raw.length > 4096) return null;

    let parsed;
    try { parsed = new URL(raw); } catch { return null; }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    const host = parsed.hostname.toLowerCase();
    if (isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;

    const allowedHosts = (hostsSetting === undefined ? DEFAULT_HOSTS : hostsSetting.split(','))
        .map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (!allowedHosts.includes(host)) return null;

    return parsed;
}

export function allowedProxyImageType(value) {
    const contentType = String(value || '').split(';', 1)[0].trim().toLowerCase();
    return ALLOWED_IMAGE_TYPES.has(contentType) ? contentType : null;
}

export async function fetchAllowedImage(url, fetchImpl = fetch) {
    // redirect:'manual' impide que un alojamiento permitido redirija a una IP privada.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);
    try {
        const response = await fetchImpl(url.href, {
            redirect: 'manual',
            signal: controller.signal,
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/bmp,image/x-icon' }
        });
        if (!response.ok) return { status: 502 };

        const contentType = allowedProxyImageType(response.headers.get('content-type'));
        if (!contentType) return { status: 415 };
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > MAX_PROXY_IMAGE_BYTES) return { status: 413 };

        if (!response.body) return { status: 502 };
        const chunks = [];
        let length = 0;
        for await (const chunk of response.body) {
            length += chunk.byteLength;
            if (length > MAX_PROXY_IMAGE_BYTES) {
                controller.abort();
                return { status: 413 };
            }
            chunks.push(Buffer.from(chunk));
        }
        return { status: 200, contentType, buffer: Buffer.concat(chunks, length) };
    } finally {
        clearTimeout(timeout);
    }
}
