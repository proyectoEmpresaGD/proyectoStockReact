/**
 * Renueva credenciales y reintenta UN 401 por caducidad en peticiones a nuestra
 * propia API. Solo toca solicitudes que ya incluían Authorization: Bearer.
 * No intercepta login, proveedores externos ni solicitudes anónimas.
 */
export function installAuthenticatedFetch(target, manager, apiBase = '') {
    const original = target.fetch.bind(target);
    const root = new URL(apiBase || '/', target.location.href);
    const rootPath = root.pathname.replace(/\/$/, '');
    const belongsToApi = (url) => {
        try {
            const parsed = new URL(url, target.location.href);
            return parsed.origin === root.origin && parsed.pathname.startsWith(`${rootPath}/api/`);
        } catch { return false; }
    };

    target.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        if (!belongsToApi(url)) return original(input, init);
        const headers = new Headers(init.headers || input?.headers);
        if (!/^Bearer\s+/i.test(headers.get('Authorization') || '')) return original(input, init);
        const token = await manager.ensureFreshToken();
        if (!token) return original(input, init);
        headers.set('Authorization', `Bearer ${token}`);
        const send = (authHeaders) => original(
            typeof Request !== 'undefined' && input instanceof Request ? input.clone() : input,
            { ...init, headers: authHeaders },
        );
        const response = await send(headers);
        if (response.status !== 401 || init.signal?.aborted) return response;
        const updated = await manager.refresh({ staleToken: token });
        if (!updated || updated === token) return response;
        headers.set('Authorization', `Bearer ${updated}`);
        return send(headers);
    };
    return () => { if (target.fetch !== original) target.fetch = original; };
}

export function installAuthenticatedAxios(axios, manager, apiBase = '', locationHref = '') {
    const root = new URL(apiBase || '/', locationHref);
    const rootPath = root.pathname.replace(/\/$/, '');
    const isOwnApi = (config) => {
        try {
            const parsed = new URL(config.url, config.baseURL || locationHref);
            return parsed.origin === root.origin && parsed.pathname.startsWith(`${rootPath}/api/`);
        } catch { return false; }
    };
    const requestId = axios.interceptors.request.use(async (config) => {
        if (!isOwnApi(config) || !/^Bearer\s+/i.test(config.headers?.get?.('Authorization') || config.headers?.Authorization || '')) return config;
        const token = await manager.ensureFreshToken();
        if (token) config.headers.set('Authorization', `Bearer ${token}`);
        return config;
    });
    const responseId = axios.interceptors.response.use(undefined, async (error) => {
        const config = error.config;
        if (error.response?.status !== 401 || !config || config.__cjmAuthRetried || !isOwnApi(config)) throw error;
        const authorization = config.headers?.get?.('Authorization') || config.headers?.Authorization;
        if (!/^Bearer\s+/i.test(authorization || '')) throw error;
        config.__cjmAuthRetried = true;
        const stale = authorization.replace(/^Bearer\s+/i, '');
        const token = await manager.refresh({ staleToken: stale });
        if (!token || token === stale) throw error;
        config.headers.set('Authorization', `Bearer ${token}`);
        return axios(config);
    });
    return () => {
        axios.interceptors.request.eject(requestId);
        axios.interceptors.response.eject(responseId);
    };
}
