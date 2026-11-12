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

// Fecha de corte FIJA (España): las facturas H/HH emitidas ANTES del 12-11-2026
// siguen visibles para todos. Desde el día 12 (incluido), requieren permiso.
// Se toma la fecha real de factura (facventa.fecha), NO la fecha del albarán.
export const CLIENT_H_INVOICE_CUTOFF_DATE = '2026-11-12';

/**
 * Condición de visibilidad de las series en Clientes, para usuarios SIN permiso.
 * - Otras series: siempre visibles.
 * - H/HH: visibles solo si existe la factura con fecha anterior al corte.
 * - Si falta la factura o su fecha, se oculta por seguridad (no hay forma
 *   fiable de acreditar que sea histórica).
 * EXISTS evita duplicar líneas incluso si hubiera cabeceras duplicadas.
 */
export const buildClientHInvoiceVisibilitySql = (invoiceAlias = 'av') => {
    if (!/^[a-z][a-z0-9_]*$/i.test(invoiceAlias)) {
        throw new Error('Alias SQL de factura no válido.');
    }
    return `(UPPER(BTRIM(COALESCE(${invoiceAlias}.codserfacventa::text, ''))) NOT IN ('H', 'HH')
        OR EXISTS (
            SELECT 1
            FROM facventa fv_historica
            WHERE fv_historica.codclien = ${invoiceAlias}.codclien
              AND UPPER(BTRIM(fv_historica.codserfacventa::text)) = UPPER(BTRIM(${invoiceAlias}.codserfacventa::text))
              AND BTRIM(fv_historica.nfacventa::text) = BTRIM(${invoiceAlias}.nfacventa::text)
              AND fv_historica.fecha::date < DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}'
        ))`;
};

/**
 * Excluye de los importes de pedidos las líneas vinculadas a facturas H/HH
 * emitidas desde la fecha de corte inclusive, no las históricas.
 * La serie del PEDIDO no es la serie de FACTURA: la relación se hace mediante
 * albventa_linea (pedido, número y línea) -> albventa (serie de factura).
 *
 * Se usa solo cuando el usuario NO tiene el permiso especial. Las líneas sin
 * factura vinculada continúan contando como pedidos, y EXISTS evita duplicar
 * importes en pedidos con varios albaranes.
 *
 * Si el ERP no sincroniza las claves de origen del pedido, la base de datos
 * deberá corregirse: no es seguro suponer la serie de factura por la de pedido.
 */
export const buildOrderHInvoiceExclusionSql = (orderAlias = 'p') => {
    if (!/^[a-z][a-z0-9_]*$/i.test(orderAlias)) {
        throw new Error('Alias SQL de pedido no válido.');
    }

    return `NOT EXISTS (
        SELECT 1
        FROM albventa_linea AS avl
        INNER JOIN albventa AS av
            ON av.codseralbventa = avl.codseralbventa
           AND av.nalbventa = avl.nalbventa
           AND av.codclien = avl.codclien
        WHERE avl.codclien = ${orderAlias}.codclien
          AND COALESCE(BTRIM(avl.canal::text), '') = COALESCE(BTRIM(${orderAlias}.canal::text), '')
          AND NULLIF(BTRIM(avl.codserpedventa::text), '') = NULLIF(BTRIM(${orderAlias}.codserpedventa::text), '')
          AND NULLIF(BTRIM(avl.npedventa::text), '') = NULLIF(BTRIM(${orderAlias}.npedventa::text), '')
          AND NULLIF(BTRIM(avl.nrbpedvenlinea::text), '') = NULLIF(BTRIM(${orderAlias}.linea::text), '')
          AND NOT ${buildClientHInvoiceVisibilitySql('av')}
    )`;
};
