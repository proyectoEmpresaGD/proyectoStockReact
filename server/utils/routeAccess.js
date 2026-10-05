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

    return normalizedAllowedRoles.includes(role);
};
