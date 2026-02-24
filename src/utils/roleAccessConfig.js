// src/utils/roleAccessConfig.js

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
    rrhh: {
        name: 'rrhh',
        permissions: ['users.read'],
        routes: ['/', '/perfilusuario', '/fichar', '/rrhh/vacaciones']
    },
    administracion: {
        name: 'administracion',
        permissions: ['stock.read', 'analytics.read'],
        routes: ['/clients', '/agenda', '/notas', '/stock', '/analitica-facturacion', '/perfilusuario',]
    },
    administrativo: {
        name: 'administrativo',
        permissions: ['analytics.read', 'sales.read'],
        routes: ['/', '/analitica-facturacion', '/perfilusuario', '/fichar']
    }
};

export const SERVER_MANAGED_ROLES = ['admin', 'comercial', 'almacen', 'ventas', 'user', 'rrhh', 'administracion', 'administrativo'];

let dynamicRoleDefinitions = { ...DEFAULT_ROLE_DEFINITIONS };
let dynamicRoleOptions = [...SERVER_MANAGED_ROLES];

const normalizePath = (path) => {
    if (!path) return '/';
    const pathWithoutQuery = path.split('?')[0].split('#')[0];
    if (pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith('/')) {
        return pathWithoutQuery.slice(0, -1);
    }
    return pathWithoutQuery;
};

const normalizeRoleName = (roleName) => String(roleName || '').trim().toLowerCase();

const sanitizeRoleDefinition = (roleName, roleConfig = {}) => {
    const name = normalizeRoleName(roleName);
    if (!name) return null;

    const routes = Array.isArray(roleConfig?.routes)
        ? [...new Set(roleConfig.routes.map((route) => String(route || '').trim()).filter(Boolean))]
        : [];

    const permissions = Array.isArray(roleConfig?.permissions)
        ? [...new Set(roleConfig.permissions.map((permission) => String(permission || '').trim()).filter(Boolean))]
        : [];

    return { name, routes, permissions };
};

export const hydrateRoleAccessFromBackend = async ({ apiBaseUrl, token }) => {
    if (!apiBaseUrl || !token) return;

    try {
        const response = await fetch(`${apiBaseUrl}/api/auth/roles-catalog`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) return;

        const payload = await response.json();
        const backendDefinitions = payload?.definitions && typeof payload.definitions === 'object'
            ? payload.definitions
            : {};

        const normalizedDefinitions = Object.entries(backendDefinitions).reduce((acc, [role, config]) => {
            const sanitized = sanitizeRoleDefinition(role, config);
            if (!sanitized) return acc;
            acc[sanitized.name] = sanitized;
            return acc;
        }, {});

        dynamicRoleDefinitions = {
            ...DEFAULT_ROLE_DEFINITIONS,
            ...normalizedDefinitions
        };

        const backendRoles = Array.isArray(payload?.roles)
            ? payload.roles.map((role) => normalizeRoleName(role)).filter(Boolean)
            : [];

        dynamicRoleOptions = [...new Set([...SERVER_MANAGED_ROLES, ...backendRoles])].sort();
    } catch (error) {
        console.error('No se pudo sincronizar los roles desde backend:', error);
    }
};

export const getRoleDefinitions = () => dynamicRoleDefinitions;
export const getRoleOptions = () => dynamicRoleOptions;

export const getRoleDefinition = (roleName) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return null;
    return dynamicRoleDefinitions[normalizedRoleName] || null;
};

export const getFirstAccessibleRoute = (roleName) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return null;
    if (normalizedRoleName === 'admin') return '/';

    const roleDefinition = getRoleDefinition(normalizedRoleName);
    if (!roleDefinition) return '/';

    const [firstRoute] = roleDefinition.routes || [];
    return firstRoute || '/';
};

export const userCanAccessRoute = (roleName, path) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return false;
    if (normalizedRoleName === 'admin') return true;

    const normalizedPath = normalizePath(path);
    const roleDefinition = getRoleDefinition(normalizedRoleName);

    if (!roleDefinition) {
        return true;
    }

    return (roleDefinition.routes || []).some((allowedRoute) => {
        if (allowedRoute === '*') return true;
        const normalizedAllowed = normalizePath(allowedRoute);
        return normalizedPath === normalizedAllowed || normalizedPath.startsWith(`${normalizedAllowed}/`);
    });
};