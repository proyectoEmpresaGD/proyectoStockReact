const normalizePath = (path) => {
    if (!path) return '/';

    const withoutQuery = String(path).split('?')[0].split('#')[0].trim();
    const normalized = withoutQuery.length > 1 && withoutQuery.endsWith('/')
        ? withoutQuery.slice(0, -1)
        : withoutQuery;

    return (normalized || '/').toLowerCase();
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const routeMatches = (currentPath, configuredPath) => {
    const current = normalizePath(currentPath);
    const configured = normalizePath(configuredPath);

    return current === configured || current.startsWith(`${configured}/`);
};

export const normalizeRouteAccess = (value) => {
    let source = value;

    if (typeof source === 'string') {
        try {
            source = JSON.parse(source);
        } catch {
            return {};
        }
    }

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return {};
    }

    return Object.entries(source).reduce((acc, [path, effect]) => {
        const normalizedPath = normalizePath(path);
        const normalizedEffect = String(effect || '').trim().toLowerCase();

        if (!normalizedPath.startsWith('/')) return acc;
        if (!['allow', 'deny'].includes(normalizedEffect)) return acc;

        acc[normalizedPath] = normalizedEffect;
        return acc;
    }, {});
};

export const getRouteOverride = (user, path) => {
    const access = normalizeRouteAccess(user?.route_access);

    const matches = Object.entries(access)
        .filter(([configuredPath]) => routeMatches(path, configuredPath))
        .sort(([pathA], [pathB]) => normalizePath(pathB).length - normalizePath(pathA).length);

    if (matches.length === 0) return null;

    const [configuredPath, effect] = matches[0];
    return {
        path: configuredPath,
        effect,
    };
};

// Caché: la configuración de roles no debe parsearse en cada consulta API.
let lastDefinitionsSource;
let lastConfiguredRoleRoutes = {};

export const getConfiguredRoleRoutes = () => {
    const source = process.env.ROLE_DEFINITIONS_JSON || '';
    if (source === lastDefinitionsSource) return lastConfiguredRoleRoutes;
    lastDefinitionsSource = source;
    lastConfiguredRoleRoutes = {};
    if (!source) return lastConfiguredRoleRoutes;
    try {
        const parsed = JSON.parse(source);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return lastConfiguredRoleRoutes;
        for (const [roleName, definition] of Object.entries(parsed)) {
            const role = normalizeRole(roleName);
            if (!role || !Array.isArray(definition?.routes)) continue;
            lastConfiguredRoleRoutes[role] = definition.routes
                .map((route) => String(route || '').trim())
                .filter((route) => route === '*' || route.startsWith('/'));
        }
    } catch {
        // Configuración no válida: no se habilitan permisos adicionales.
    }
    return lastConfiguredRoleRoutes;
};

export const userHasAppRouteAccess = (user, path, allowedRoles = []) => {
    const role = normalizeRole(user?.role);

    if (!role) return false;
    if (role === 'admin') return true;

    const override = getRouteOverride(user, path);

    if (override?.effect === 'deny') return false;
    if (override?.effect === 'allow') return true;

    const normalizedAllowedRoles = allowedRoles
        .flat()
        .map(normalizeRole)
        .filter(Boolean);

    if (normalizedAllowedRoles.includes(role)) return true;

    // El catálogo enviado al frontend incorpora ROLE_DEFINITIONS_JSON.
    // Un rol personalizado con una ruta configurada debe tener el mismo
    // acceso en la API, manteniendo la prioridad de los permisos individuales.
    const customDefinitions = getConfiguredRoleRoutes();
    const configuredRoutes = customDefinitions[role] || [];
    return configuredRoutes.some((configuredRoute) => (
        configuredRoute === '*' || routeMatches(path, configuredRoute)
    ));
};
