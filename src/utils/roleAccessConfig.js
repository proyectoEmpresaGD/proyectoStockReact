// src/utils/roleAccessConfig.js
const STORAGE_KEY = 'roleDefinitions';

export const AVAILABLE_PERMISSIONS = [
    { value: 'users.read', label: 'Ver usuarios' },
    { value: 'users.write', label: 'Gestionar usuarios' },
    { value: 'stock.read', label: 'Ver stock' },
    { value: 'stock.write', label: 'Editar stock' },
    { value: 'sales.read', label: 'Ver ventas' },
    { value: 'sales.write', label: 'Gestionar ventas' },
    { value: 'analytics.read', label: 'Ver analíticas' },
    { value: 'labels.read', label: 'Usar etiquetas' }
];

export const AVAILABLE_ROUTES = [
    { path: '/', label: 'Inicio' },
    { path: '/clients', label: 'Clientes' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/notas', label: 'Notas' },
    { path: '/stock', label: 'Stock' },
    { path: '/equivalencias', label: 'Equivalencias' },
    { path: '/stock-alerts', label: 'Control de stock' },
    { path: '/entradas', label: 'Entradas' },
    { path: '/comprobacionExcel', label: 'Validación presupuestos' },
    { path: '/mapa-clientes', label: 'Mapa clientes' },
    { path: '/mapa-españa', label: 'Mapa España' },
    { path: '/analitica-facturacion', label: 'Facturación' },
    { path: '/etiquetas', label: 'Etiquetas QUALITY' },
    { path: '/EtiquetasMarke', label: 'Etiqueta fotos' },
    { path: '/estiquetaSinQR', label: 'Etiqueta sin QR' },
    { path: '/EtiquetaPersonalizable', label: 'Etiqueta personalizable' },
    { path: '/EtiquetaCameo', label: 'Etiqueta Cameo' },
    { path: '/gestionusuarios', label: 'Gestión de usuarios' },
    { path: '/perfilusuario', label: 'Perfil usuario' },
    { path: '/fichar', label: 'Fichar' },
    { path: '/rrhh/vacaciones', label: 'RRHH vacaciones' }
];

const DEFAULT_ROLE_DEFINITIONS = {
    admin: {
        name: 'admin',
        permissions: AVAILABLE_PERMISSIONS.map((permission) => permission.value),
        routes: ['*']
    },
    comercial: {
        name: 'comercial',
        permissions: ['users.read', 'stock.read', 'sales.read'],
        routes: ['/', '/clients', '/agenda', '/notas', '/stock', '/perfilusuario', '/fichar']
    },
    almacen: {
        name: 'almacen',
        permissions: ['stock.read', 'stock.write', 'labels.read'],
        routes: ['/', '/stock', '/equivalencias', '/stock-alerts', '/etiquetas', '/EtiquetasMarke', '/estiquetaSinQR', '/EtiquetaPersonalizable', '/EtiquetaCameo', '/perfilusuario', '/fichar']
    },
    ventas: {
        name: 'ventas',
        permissions: ['sales.read', 'sales.write', 'stock.read'],
        routes: ['/', '/stock', '/entradas', '/comprobacionExcel', '/perfilusuario', '/fichar']
    },
    user: {
        name: 'user',
        permissions: ['stock.read'],
        routes: ['/', '/stock', '/perfilusuario', '/fichar']
    },
    administrativo: {
        name: 'administrativo',
        permissions: ['analytics.read', 'sales.read'],
        routes: ['/', '/analitica-facturacion', '/perfilusuario', '/fichar']
    }
};

export const DEFAULT_ROLE_NAMES = Object.keys(DEFAULT_ROLE_DEFINITIONS);
export const SERVER_MANAGED_ROLES = ['admin', 'comercial', 'almacen', 'ventas', 'user', 'rrhh', 'administrativo'];
const unique = (values = []) => [...new Set(values)];

const sanitizeRoleDefinitions = (definitions = {}) =>
    Object.entries(definitions).reduce((acc, [rawRoleName, roleConfig]) => {
        const roleName = String(rawRoleName || '').trim().toLowerCase();
        if (!roleName) return acc;

        const routes = unique(Array.isArray(roleConfig?.routes) ? roleConfig.routes : [])
            .map((route) => String(route || '').trim())
            .filter(Boolean);

        const permissions = unique(Array.isArray(roleConfig?.permissions) ? roleConfig.permissions : [])
            .map((permission) => String(permission || '').trim())
            .filter(Boolean);

        acc[roleName] = {
            name: roleName,
            permissions,
            routes
        };

        return acc;
    }, {});

const normalizePath = (path) => {
    if (!path) return '/';
    const pathWithoutQuery = path.split('?')[0].split('#')[0];
    if (pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith('/')) {
        return pathWithoutQuery.slice(0, -1);
    }
    return pathWithoutQuery;
};

export const getRoleDefinitions = () => {
    if (typeof window === 'undefined') return DEFAULT_ROLE_DEFINITIONS;

    try {
        const storedRaw = localStorage.getItem(STORAGE_KEY);
        if (!storedRaw) return DEFAULT_ROLE_DEFINITIONS;

        const stored = sanitizeRoleDefinitions(JSON.parse(storedRaw));
        return { ...DEFAULT_ROLE_DEFINITIONS, ...stored };
    } catch (error) {
        console.error('No se pudo leer la configuración de roles:', error);
        return DEFAULT_ROLE_DEFINITIONS;
    }
};

export const saveRoleDefinitions = (definitions) => {
    if (typeof window === 'undefined') return;
    const sanitizedDefinitions = sanitizeRoleDefinitions(definitions);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedDefinitions));
};

export const getRoleOptions = () => Object.keys(getRoleDefinitions());

export const getRoleDefinition = (roleName) => getRoleDefinitions()[roleName] || null;

export const userCanAccessRoute = (roleName, path) => {
    if (!roleName) return false;
    if (roleName === 'admin') return true;

    const normalizedPath = normalizePath(path);
    const roleDefinition = getRoleDefinition(roleName);

    if (!roleDefinition) return false;

    return (roleDefinition.routes || []).some((allowedRoute) => {
        if (allowedRoute === '*') return true;
        const normalizedAllowed = normalizePath(allowedRoute);
        return normalizedPath === normalizedAllowed || normalizedPath.startsWith(`${normalizedAllowed}/`);
    });
};