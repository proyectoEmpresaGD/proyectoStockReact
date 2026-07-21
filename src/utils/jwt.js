const base64UrlDecode = (value) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

    try {
        return decodeURIComponent(
            atob(padded)
                .split('')
                .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join('')
        );
    } catch {
        return atob(padded);
    }
};

export const decodeJwtPayload = (token) => {
    if (!token || typeof token !== 'string') {
        throw new Error('Token JWT no informado');
    }

    const [, payload] = token.split('.');

    if (!payload) {
        throw new Error('Token JWT inválido');
    }

    return JSON.parse(base64UrlDecode(payload));
};
