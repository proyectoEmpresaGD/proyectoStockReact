// src/utils/roleAccessConfig.js

export const AVAILABLE_PERMISSIONS = [
    { value: 'users.read', label: 'Ver usuarios' },
    { value: 'users.write', label: 'Gestionar usuarios' },
    { value: 'stock.read', label: 'Ver stock' },
    { value: 'stock.write', label: 'Editar stock' },
    { value: 'sales.read', label: 'Ver ventas' },
    { value: 'sales.write', label: 'Gestionar ventas' },
    { value: 'analytics.read', label: 'Ver analíticas' },
    { value: 'labels.read', label: 'Usar etiquetas' },
    { value: 'purchasing.read', label: 'Gestionar compras y aprovisionamiento' }

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
    { path: '/mapas-facturacion', label: 'Mapas de facturación' },
    { path: '/mapa-clientes', label: 'Mapa clientes', individualAccess: false, showInPermissionEditor: false, fallback: false, accessNote: 'Se controla desde Mapas de facturación' },
    { path: '/mapa-españa', label: 'Mapa España', individualAccess: false, showInPermissionEditor: false, fallback: false, accessNote: 'Se controla desde Mapas de facturación' },
    { path: '/analitica-facturacion', label: 'Facturación' },
    { path: '/intrastat', label: 'Intrastat' },
    { path: '/etiquetas', label: 'Etiquetas QUALITY' },
    { path: '/etiquetas-contractalia', label: 'Etiquetas QUALITY Contractalia' },
    { path: '/EtiquetasMarke', label: 'Etiqueta fotos' },
    { path: '/estiquetaSinQR', label: 'Etiqueta sin QR' },
    { path: '/EtiquetaPersonalizable', label: 'Etiqueta personalizable' },
    { path: '/EtiquetaCameo', label: 'Etiqueta Cameo' },
    { path: '/EtiquetaLibroIconos', label: 'Libro Iconos' },
    { path: '/EtiquetaLibroIconosCompleta', label: 'Etiqueta contractalia completa' },
    { path: '/etiquetas-lotes', label: 'Etiquetas por lote' },
    { path: '/libro', label: 'LIBRO' },
    { path: '/libroNormativa', label: 'Libro Normativa' },
    { path: '/EtiquetasLibro35Tipo1', label: 'Tipo 1 (13cm)' },
    { path: '/EtiquetasLibro35Tipo2', label: 'Tipo 2 (20cm)' },
    { path: '/Libro35AnchoConImagen', label: 'LIBRO 35cm + IMAGEN' },
    { path: '/Libro45AnchoConImagen', label: 'LIBRO 45cm + IMAGEN' },
    { path: '/perchas', label: 'PERCHAS LISOS' },
    { path: '/perchasEstampados', label: 'PERCHAS ESTAMPADOS' },
    {
        path: '/etiquetas-producto',
        label: 'Carteles producto almacen'
    },
    { path: '/gestionusuarios', label: 'Gestión de usuarios', individualAccess: false, accessNote: 'Solo administradores' },
    { path: '/perfilusuario', label: 'Perfil usuario' },
    { path: '/fichar', label: 'Fichar', individualAccess: false, showInPermissionEditor: false, fallback: false, accessNote: 'Se controla desde Registro de jornada' },
    { path: '/rrhh/jornada', label: 'RRHH registro de jornada' },
    { path: '/rrhh/vacaciones', label: 'RRHH vacaciones', individualAccess: false, fallback: false, accessNote: 'Se gestiona desde el módulo de Vacaciones' }
];

const DOCUMENT_LABEL_ROUTES = [
    '/libro',
    '/libro19x4',
    '/libroNormativa',
    '/EtiquetasLibro35Tipo1',
    '/EtiquetasLibro35Tipo2',
    '/Libro35AnchoConImagen',
    '/Libro45AnchoConImagen',
    '/etiquetas-lotes',
    '/etiquetas-producto',
    '/perchas',
    '/perchasEstampados',
    '/EtiquetaContraportada35',
    '/EtiquetaContraportada20',
    '/EtiquetaLibroIconos',
    '/EtiquetaLibroIconosCompleta'
];

const WAREHOUSE_ROUTES = [

    '/',
    '/stock',
    '/equivalencias',
    '/fichaTecnica',
    '/etiquetas',
    '/etiquetas-contractalia',
    '/reservasTejido',
    '/EtiquetasMarke',
    '/estiquetaSinQR',
    '/EtiquetaPersonalizable',
    '/EtiquetaCameo',
    ...DOCUMENT_LABEL_ROUTES,
    '/perfilusuario',
    '/fichar',
    '/rrhh/jornada',
    '/rrhh/vacaciones'
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
            '/rrhh/jornada',
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
        routes: [...WAREHOUSE_ROUTES]
    },
    compras: {
        name: 'compras',
        permissions: ['stock.read', 'stock.write', 'labels.read', 'purchasing.read'],
        routes: [...WAREHOUSE_ROUTES, '/stock-alerts']
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
            '/rrhh/jornada',
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
            '/rrhh/jornada',
            '/rrhh/vacaciones'
        ]
    },
    rrhh: {
        name: 'rrhh',
        permissions: ['users.read'],
        routes: ['/', '/perfilusuario', '/fichar', '/rrhh/jornada', '/rrhh/vacaciones']
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
            '/mapas-facturacion',
            '/perfilusuario',
            '/rrhh/jornada',
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
            '/rrhh/jornada',
            '/rrhh/vacaciones',
            '/reservasTejido',
            '/intrastat',]
    }
};

export const SERVER_MANAGED_ROLES = ['admin', 'comercial', 'almacen', 'compras', 'ventas', 'user', 'rrhh', 'administracion', 'administrativo'];

let dynamicRoleDefinitions = { ...DEFAULT_ROLE_DEFINITIONS };
let dynamicRoleOptions = [...SERVER_MANAGED_ROLES];

const normalizePath = (path) => {
    if (!path) return '/';
    const pathWithoutQuery = path.split('?')[0].split('#')[0];
    const normalizedPath = pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith('/')
        ? pathWithoutQuery.slice(0, -1)
        : pathWithoutQuery;

    return normalizedPath.toLowerCase();
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
        const response = await fetch(
            `${apiBaseUrl}/api/auth/roles-catalog`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            return;
        }

        const payload = await response.json();

        const backendDefinitions =
            payload?.definitions &&
                typeof payload.definitions === 'object'
                ? payload.definitions
                : {};

        const normalizedDefinitions = Object.entries(
            backendDefinitions
        ).reduce((acc, [role, config]) => {
            const sanitized =
                sanitizeRoleDefinition(role, config);

            if (!sanitized) {
                return acc;
            }

            acc[sanitized.name] = sanitized;

            return acc;
        }, {});

        const mergedDefinitions = {
            ...DEFAULT_ROLE_DEFINITIONS
        };

        Object.entries(normalizedDefinitions).forEach(
            ([roleName, backendRole]) => {
                const defaultRole =
                    DEFAULT_ROLE_DEFINITIONS[roleName];

                if (!defaultRole) {
                    mergedDefinitions[roleName] =
                        backendRole;

                    return;
                }

                mergedDefinitions[roleName] = {
                    name: roleName,

                    permissions: [
                        ...new Set([
                            ...(defaultRole.permissions || []),
                            ...(backendRole.permissions || [])
                        ])
                    ],

                    routes: [
                        ...new Set([
                            ...(defaultRole.routes || []),
                            ...(backendRole.routes || [])
                        ])
                    ]
                };
            }
        );

        dynamicRoleDefinitions =
            mergedDefinitions;

        const backendRoles =
            Array.isArray(payload?.roles)
                ? payload.roles
                    .map((role) =>
                        normalizeRoleName(role)
                    )
                    .filter(Boolean)
                : [];

        dynamicRoleOptions = [
            ...new Set([
                ...SERVER_MANAGED_ROLES,
                ...backendRoles
            ])
        ].sort();
    } catch (error) {
        console.error(
            'No se pudo sincronizar los roles desde backend:',
            error
        );
    }
};

export const getRoleDefinitions = () => dynamicRoleDefinitions;
export const getRoleOptions = () => dynamicRoleOptions;

export const getRoleDefinition = (roleName) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return null;
    return dynamicRoleDefinitions[normalizedRoleName] || null;
};

export const normalizeRouteAccessMap = (routeAccess) => {
    let source = routeAccess;

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
        const normalizedEffect = String(effect || '').trim().toLowerCase();
        if (!['allow', 'deny'].includes(normalizedEffect)) return acc;

        acc[normalizePath(path)] = normalizedEffect;
        return acc;
    }, {});
};

export const getUserRouteOverride = (routeAccess, path) => {
    const normalizedPath = normalizePath(path);
    const normalizedAccess = normalizeRouteAccessMap(routeAccess);

    const matches = Object.entries(normalizedAccess)
        .filter(([configuredPath]) => (
            normalizedPath === configuredPath
            || normalizedPath.startsWith(`${configuredPath}/`)
        ))
        .sort(([pathA], [pathB]) => pathB.length - pathA.length);

    if (matches.length === 0) return null;

    const [configuredPath, effect] = matches[0];
    return { path: configuredPath, effect };
};

export const canManageRouteIndividually = (path) => {
    const normalizedPath = normalizePath(path);
    const route = AVAILABLE_ROUTES
        .filter((item) => {
            const configuredPath = normalizePath(item.path);
            return normalizedPath === configuredPath || normalizedPath.startsWith(`${configuredPath}/`);
        })
        .sort((a, b) => normalizePath(b.path).length - normalizePath(a.path).length)[0];

    return route?.individualAccess !== false;
};

const roleCanAccessRoute = (roleName, path) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return false;
    if (normalizedRoleName === 'admin') return true;

    const normalizedPath = normalizePath(path);

    // Vacaciones mantiene su control individual específico en backend.
    // Esta capa de rutas no debe impedir que RRHH habilite el módulo.
    if (normalizedPath === '/rrhh/vacaciones' || normalizedPath.startsWith('/rrhh/vacaciones/')) {
        return true;
    }

    const roleDefinition = getRoleDefinition(normalizedRoleName);

    // Se conserva el comportamiento histórico para roles dinámicos todavía no hidratados.
    if (!roleDefinition) {
        return true;
    }

    return (roleDefinition.routes || []).some((allowedRoute) => {
        if (allowedRoute === '*') return true;
        const normalizedAllowed = normalizePath(allowedRoute);
        return normalizedPath === normalizedAllowed || normalizedPath.startsWith(`${normalizedAllowed}/`);
    });
};

export const userCanAccessRoute = (roleName, path, routeAccess = {}) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return false;
    if (normalizedRoleName === 'admin') return true;

    const normalizedPath = normalizePath(path);

    // Vacaciones y Gestión de usuarios tienen reglas propias y no admiten
    // excepciones genéricas desde el editor de permisos por usuario.
    if (!canManageRouteIndividually(normalizedPath)) {
        return roleCanAccessRoute(normalizedRoleName, normalizedPath);
    }

    const override = getUserRouteOverride(routeAccess, normalizedPath);

    if (override?.effect === 'deny') return false;
    if (override?.effect === 'allow') return true;

    return roleCanAccessRoute(normalizedRoleName, normalizedPath);
};

export const getFirstAccessibleRoute = (roleName, routeAccess = {}) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) return null;
    if (normalizedRoleName === 'admin') return '/';

    const firstAvailable = AVAILABLE_ROUTES.find((route) => (
        route.fallback !== false
        && userCanAccessRoute(normalizedRoleName, route.path, routeAccess)
    ));

    return firstAvailable?.path || '/';
};

