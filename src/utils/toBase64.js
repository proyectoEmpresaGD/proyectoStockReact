// src/utils/toBase64.js

export const toBase64 = async (url) => {
    if (!url) return '';

    const cleanUrl = String(url).trim();

    const proxyUrl = `${import.meta.env.VITE_API_BASE_URL}/api/proxy?url=${encodeURIComponent(cleanUrl)}`;

    try {
        const res = await fetch(proxyUrl);

        if (!res.ok) {
            console.error('[toBase64] Proxy error:', res.status, proxyUrl);
            return '';
        }

        const contentType = res.headers.get('content-type') || '';

        // Si viene HTML, no es una imagen (normalmente index.html/redirect/404)
        if (contentType.includes('text/html')) {
            const htmlPreview = await res.text();

            console.error('[toBase64] Not an image (received text/html).');
            console.error('[toBase64] Original URL:', cleanUrl);
            console.error('[toBase64] Proxy URL:', proxyUrl);
            console.error('[toBase64] HTML preview:', htmlPreview.slice(0, 400));

            return '';
        }

        // Solo aceptamos imágenes
        if (!contentType.startsWith('image/')) {
            console.error('[toBase64] Unsupported content-type:', contentType);
            console.error('[toBase64] Original URL:', cleanUrl);
            console.error('[toBase64] Proxy URL:', proxyUrl);
            return '';
        }

        const blob = await res.blob();

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.error('[toBase64] Error:', err);
        return '';
    }
};
