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
    { path: '/fichaTecnica', label: 'Ficha Técnica' },
    { path: '/reservasTejido', label: 'Reservas' },
    { path: '/entradas', label: 'Entradas' },
    { path: '/comprobacionExcel', label: 'Validación presupuestos' },
    { path: '/mapa-clientes', label: 'Mapa clientes' },
    { path: '/mapa-españa', label: 'Mapa España' },
    { path: '/analitica-facturacion', label: 'Facturación' },
    { path: '/intrastat', label: 'Intrastat' },
    { path: '/etiquetas', label: 'Etiquetas QUALITY' },
    { path: '/EtiquetasMarke', label: 'Etiqueta fotos' },
    { path: '/estiquetaSinQR', label: 'Etiqueta sin QR' },
    { path: '/EtiquetaPersonalizable', label: 'Etiqueta personalizable' },
    { path: '/EtiquetaCameo', label: 'Etiqueta Cameo' },
    { path: '/etiquetas-lotes', label: 'Etiquetas por lote' },
    { path: '/libro', label: 'LIBRO' },
    { path: '/libro19x4', label: 'LIBRO 19 x 4 cm' },
    { path: '/libroNormativa', label: 'Libro Normativa' },
    { path: '/EtiquetasLibro35Tipo1', label: 'Tipo 1 (13cm)' },
    { path: '/EtiquetasLibro35Tipo2', label: 'Tipo 2 (20cm)' },
    { path: '/Libro35AnchoConImagen', label: 'LIBRO 35cm + IMAGEN' },
    { path: '/Libro45AnchoConImagen', label: 'LIBRO 45cm + IMAGEN' },
    { path: '/perchas', label: 'PERCHAS LISOS' },
    { path: '/perchasEstampados', label: 'PERCHAS ESTAMPADOS' },
    { path: '/EtiquetaContraportada35', label: 'Contraportada (35cm)' },
    { path: '/EtiquetaContraportada20', label: 'Contraportada (20cm)' },

    { path: '/gestionusuarios', label: 'Gestión de usuarios' },
    { path: '/perfilusuario', label: 'Perfil usuario' },
    { path: '/fichar', label: 'Fichar' },
    { path: '/rrhh/vacaciones', label: 'RRHH vacaciones' }
];

const DOCUMENT_LABEL_ROUTES = [
    '/libro',
    '/libro19x4',
    '/libroNormativa',
    '/EtiquetasLibro35Tipo1',
    '/EtiquetasLibro35Tipo2',
    '/Libro35AnchoConImagen',
    '/Libro45AnchoConImagen',
    '/perchas',
    '/perchasEstampados',
    '/EtiquetaContraportada35',
    '/EtiquetaContraportada20'
];

const DEFAULT_ROLE_DEFINITIONS = {
    admin: {
        name: 'admin',
        permissions: AVAILABLE_PERMISSIONS.map((permission) => permission.value),
        routes: ['*']
    },
    comercial: {
        name: 'comercial',
        permissions: ['users.read', 'stock.read', 'sales.read', 'labels.read'],
        routes: [
            '/',
            '/clients',
            '/agenda',
            '/notas',
            '/stock',
            '/perfilusuario',
            '/fichar',
            '/rrhh/vacaciones'
        ]
    },

    decoandyou: {
        name: 'comercial',
        permissions: ['users.read', 'stock.read', 'sales.read', 'labels.read'],
        routes: [
            '/',
            '/clients',
            '/stock',
            '/perfilusuario'
        ]

    },

    almacen: {
        name: 'almacen',
        permissions: ['stock.read', 'stock.write', 'labels.read'],
        routes: [
            '/etiquetas-lotes',
            '/',
            '/stock',
            '/equivalencias',
            '/stock-alerts',
            '/fichaTecnica',
            '/etiquetas',
            '/reservasTejido',
            '/EtiquetasMarke',
            '/estiquetaSinQR',
            '/EtiquetaPersonalizable',
            '/EtiquetaCameo',
            ...DOCUMENT_LABEL_ROUTES,
            '/perfilusuario',
            '/fichar',
            '/rrhh/vacaciones'
        ]
    },
    ventas: {
        name: 'ventas',
        permissions: ['sales.read', 'sales.write', 'stock.read'],
        routes: [
            '/',
            '/stock',
            '/reservasTejido',
            '/entradas',
            '/comprobacionExcel',
            '/perfilusuario',
            '/fichar',
            '/rrhh/vacaciones'
        ]
    },
    user: {
        name: 'user',
        permissions: ['stock.read', 'labels.read'],
        routes: [
            '/',
            '/stock',
            '/fichaTecnica',
            ...DOCUMENT_LABEL_ROUTES,
            '/perfilusuario',
            '/fichar',
            '/rrhh/vacaciones'
        ]
    },
    rrhh: {
        name: 'rrhh',
        permissions: ['users.read'],
        routes: ['/', '/perfilusuario', '/fichar', '/rrhh/vacaciones']
    },
    administracion: {
        name: 'administracion',
        permissions: ['stock.read', 'analytics.read', 'labels.read'],
        routes: [
            '/clients',
            '/agenda',
            '/notas',
            '/stock',
            '/reservasTejido',
            '/fichaTecnica',
            ...DOCUMENT_LABEL_ROUTES,
            '/analitica-facturacion',
            '/perfilusuario',
            '/rrhh/vacaciones'
        ]
    },
    administrativo: {
        name: 'administrativo',
        permissions: ['analytics.read', 'sales.read'],
        routes: ['/',
            '/analitica-facturacion',
            '/perfilusuario',
            '/fichar',
            '/rrhh/vacaciones',
            '/reservasTejido',
            '/intrastat',]
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