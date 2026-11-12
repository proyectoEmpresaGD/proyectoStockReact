import { normalizeRouteAccess } from './routeAccess.js';

// Permiso específico para los datos de facturación dentro de Clientes.
// No es una ruta navegable. No se hereda de /clients ni de ROLE_DEFINITIONS_JSON.
export const CLIENT_H_INVOICES_PERMISSION = '/clients/series-h-hh';

export const canViewClientHInvoices = (user) => {
    if (String(user?.role || '').trim().toLowerCase() === 'admin') return true;
    return normalizeRouteAccess(user?.route_access)[CLIENT_H_INVOICES_PERMISSION] === 'allow';
};

export const isClientHInvoiceSeries = (series) =>
    ['H', 'HH'].includes(String(series ?? '').trim().toUpperCase());
