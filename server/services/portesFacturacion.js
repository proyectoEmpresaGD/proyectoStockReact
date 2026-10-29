/**
 * Origen de portes de VENTAS.
 * Nueva modalidad: una línea de albventa_linea cuyo codprodu se configura como portes.
 * Antigua modalidad: facventa.impportes. Nunca se suman ambas por la misma factura.
 *
 * No altera impbruto, impbase ni imptotal: son importes contables originales del ERP.
 */
import pool from '../db/pool.js';

// Artículos de portes de ventas confirmados en el ERP (península, Baleares, Canarias, UE e internacional).
const DEFAULT_CODES = ['PORTES81', 'PORTES82', 'PORTES83', 'PORTES84', 'PORTES85'];
let schemaCache = null;

export function getPortesProductCodes(env = process.env) {
    const raw = env.FACTURACION_PORTES_CODIGOS;
    if (typeof raw !== 'string' || !raw.trim()) return [...DEFAULT_CODES];
    const codes = raw.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
    return [...new Set(codes)].slice(0, 30);
}

export function shouldMatchInvoiceExercise(env = process.env) {
    return env.FACTURACION_PORTES_MISMO_EJERCICIO !== '0';
}

export function selectPortesAmount({ lineCount = 0, lineAmount = 0, legacyAmount = 0 } = {}) {
    const fromLines = Number(lineCount) > 0;
    return {
        importe: fromLines ? Number(lineAmount || 0) : Number(legacyAmount || 0),
        origen: fromLines ? 'lineas_albaran' : 'cabecera_factura',
    };
}

function quoted(column) {
    return `"${String(column).replace(/"/g, '""')}"`;
}

function field(columns, preferred) {
    const column = columns.get(preferred.toLowerCase());
    return column ? quoted(column) : null;
}

async function getSchema(db) {
    // Cache solo para el pool real. Los tests pueden inyectar su propio cliente.
    if (db === pool && schemaCache) return schemaCache;
    const { rows } = await db.query(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('facventa', 'albventa_linea')
    `);
    const facventa = new Map();
    const lineas = new Map();
    for (const row of rows) {
        const map = String(row.table_name).toLowerCase() === 'facventa' ? facventa : lineas;
        map.set(String(row.column_name).toLowerCase(), String(row.column_name));
    }
    const result = { facventa, lineas };
    if (db === pool) schemaCache = result;
    return result;
}

export function buildPortesJoin(schema, { invoiceAlias = 'f', lineAlias = 'l', codesParameter = '$1', grouped = false, matchExercise = true } = {}) {
    const invoice = schema.facventa;
    const lines = schema.lineas;
    const legacyCol = field(invoice, 'impportes');
    const legacyExpr = legacyCol ? `COALESCE(${invoiceAlias}.${legacyCol}::numeric, 0)` : '0::numeric';
    const legacyTypeCol = field(invoice, 'portes');
    const legacyIntrastatExpr = legacyTypeCol
        ? `CASE WHEN UPPER(TRIM(${invoiceAlias}.${legacyTypeCol}::text)) = 'P' THEN ${legacyExpr} ELSE 0::numeric END`
        : '0::numeric';
    const mandatory = ['codserfacventa', 'nfacventa', 'codprodu', 'impbruto'];
    const canJoin = invoice.has('codserfacventa') && invoice.has('nfacventa') && mandatory.every((col) => lines.has(col));
    if (!canJoin) {
        return {
            joinSql: `CROSS JOIN LATERAL (SELECT 0::bigint AS line_count, 0::numeric AS line_amount) AS shipping`,
            amountExpr: legacyExpr,
            intrastatAmountExpr: legacyIntrastatExpr,
            sourceExpr: `'cabecera_factura'::text`,
            lineAmountExpr: '0::numeric',
            legacyExpr,
            hasLineLookup: false,
        };
    }
    const matchingKeys = ['codserfacventa', 'nfacventa'];
    // Para evitar cruces entre facturas con la misma serie/número cuando ambas tablas
    // poseen esas dimensiones. Ejercicio debe validarse en el ERP si existen albaranes
    // de un ejercicio facturados en otro.
    for (const key of ['canal', 'ejercicio']) {
        if (invoice.has(key) && lines.has(key) && (key !== 'ejercicio' || matchExercise)) matchingKeys.push(key);
    }
    let joinSql;
    if (grouped) {
        // Una sola lectura de albventa_linea para TODOS los documentos del período.
        // No multiplica las facturas ni realiza N búsquedas correlacionadas.
        const groupFields = matchingKeys.map((key, index) => {
            const normalized = key === 'codserfacventa'
                ? `UPPER(TRIM(${lineAlias}.${field(lines, key)}::text))`
                : `TRIM(${lineAlias}.${field(lines, key)}::text)`;
            return `${normalized} AS match_${index}`;
        });
        const matchingConditions = matchingKeys.map((key, index) => {
            const normalized = key === 'codserfacventa'
                ? `UPPER(TRIM(${invoiceAlias}.${field(invoice, key)}::text))`
                : `TRIM(${invoiceAlias}.${field(invoice, key)}::text)`;
            return `shipping.match_${index} = ${normalized}`;
        });
        joinSql = `LEFT JOIN (
            SELECT ${groupFields.join(',\n                   ')},
                   COUNT(*)::bigint AS line_count,
                   COALESCE(SUM(${lineAlias}.${field(lines, 'impbruto')}::numeric), 0) AS line_amount
            FROM public.albventa_linea ${lineAlias}
            WHERE UPPER(TRIM(${lineAlias}.${field(lines, 'codprodu')}::text)) = ANY(${codesParameter}::text[])
            GROUP BY ${matchingKeys.map((_, i) => i + 1).join(', ')}
        ) shipping ON ${matchingConditions.join(' AND ')}`;
    } else {
        const conditions = matchingKeys.map((key) => {
            const normalizer = key === 'codserfacventa' ? 'UPPER' : '';
            const left = `TRIM(${lineAlias}.${field(lines, key)}::text)`;
            const right = `TRIM(${invoiceAlias}.${field(invoice, key)}::text)`;
            return `${normalizer ? `UPPER(${left})` : left} = ${normalizer ? `UPPER(${right})` : right}`;
        });
        conditions.push(`UPPER(TRIM(${lineAlias}.${field(lines, 'codprodu')}::text)) = ANY(${codesParameter}::text[])`);
        joinSql = `LEFT JOIN LATERAL (
            SELECT COUNT(*)::bigint AS line_count,
                   COALESCE(SUM(${lineAlias}.${field(lines, 'impbruto')}::numeric), 0) AS line_amount
            FROM public.albventa_linea ${lineAlias}
            WHERE ${conditions.join('\n              AND ')}
        ) shipping ON TRUE`;
    }
    return {
        joinSql,
        amountExpr: `CASE WHEN shipping.line_count > 0 THEN shipping.line_amount ELSE ${legacyExpr} END`,
        intrastatAmountExpr: `CASE WHEN shipping.line_count > 0 THEN shipping.line_amount ELSE ${legacyIntrastatExpr} END`,
        sourceExpr: `CASE WHEN shipping.line_count > 0 THEN 'lineas_albaran' ELSE 'cabecera_factura' END`,
        lineAmountExpr: 'CASE WHEN shipping.line_count > 0 THEN shipping.line_amount ELSE 0::numeric END',
        legacyExpr,
        hasLineLookup: true,
    };
}

export async function getPortesSummaryForFilteredInvoices({ whereSql = '', values = [] } = {}, db = pool) {
    const schema = await getSchema(db);
    const codes = getPortesProductCodes();
    const portJoin = buildPortesJoin(schema, { codesParameter: `$${values.length + 1}`, grouped: true, matchExercise: shouldMatchInvoiceExercise() });
    const params = portJoin.hasLineLookup ? [...values, codes] : [...values];
    const { rows } = await db.query(`
        SELECT COALESCE(SUM(${portJoin.amountExpr}), 0) AS portes_totales,
               COALESCE(SUM(${portJoin.lineAmountExpr}), 0) AS portes_lineas_total,
               COALESCE(SUM(${portJoin.legacyExpr}), 0) AS portes_cabecera_original,
               COUNT(*) FILTER (WHERE shipping.line_count > 0)::int AS facturas_con_portes_linea,
               COUNT(*) FILTER (WHERE COALESCE(shipping.line_count, 0) = 0 AND (${portJoin.legacyExpr}) <> 0)::int AS facturas_con_portes_cabecera
        FROM public.facventa f
        ${portJoin.joinSql}
        ${whereSql}
    `, params);
    return {
        portes_totales: Number(rows[0]?.portes_totales || 0),
        portes_lineas_total: Number(rows[0]?.portes_lineas_total || 0),
        portes_cabecera_original: Number(rows[0]?.portes_cabecera_original || 0),
        facturas_con_portes_linea: Number(rows[0]?.facturas_con_portes_linea || 0),
        facturas_con_portes_cabecera: Number(rows[0]?.facturas_con_portes_cabecera || 0),
        deteccion_lineas_disponible: portJoin.hasLineLookup,
        codigos_portes_configurados: codes,
    };
}

export async function getPortesForInvoice({ codserfacventa, nfacventa, canal = null, ejercicio = null } = {}, db = pool) {
    const schema = await getSchema(db);
    if (!schema.facventa.has('codserfacventa') || !schema.facventa.has('nfacventa')) return null;
    const codes = getPortesProductCodes();
    const portJoin = buildPortesJoin(schema, { codesParameter: '$3', matchExercise: shouldMatchInvoiceExercise() });
    const where = [
        `UPPER(TRIM(f.${field(schema.facventa, 'codserfacventa')}::text)) = $1`,
        `TRIM(f.${field(schema.facventa, 'nfacventa')}::text) = $2`,
    ];
    const params = [String(codserfacventa ?? '').trim().toUpperCase(), String(nfacventa ?? '').trim()];
    if (portJoin.hasLineLookup) params.push(codes);
    if (canal != null && schema.facventa.has('canal')) {
        params.push(String(canal).trim());
        where.push(`TRIM(f.${field(schema.facventa, 'canal')}::text) = $${params.length}`);
    }
    if (ejercicio != null && schema.facventa.has('ejercicio')) {
        params.push(String(ejercicio).trim());
        where.push(`TRIM(f.${field(schema.facventa, 'ejercicio')}::text) = $${params.length}`);
    }
    const order = schema.facventa.has('ejercicio') ? `ORDER BY f.${field(schema.facventa, 'ejercicio')} DESC NULLS LAST` : '';
    const { rows } = await db.query(`
        SELECT ${portJoin.amountExpr} AS importe,
               ${portJoin.intrastatAmountExpr} AS importe_intrastat,
               ${portJoin.sourceExpr} AS origen,
               shipping.line_count AS lineas_portes
        FROM public.facventa f
        ${portJoin.joinSql}
        WHERE ${where.join(' AND ')}
        ${order}
        LIMIT 1
    `, params);
    if (!rows.length) return null;
    return {
        importe: Number(rows[0].importe || 0),
        importe_intrastat: Number(rows[0].importe_intrastat || 0),
        origen: rows[0].origen,
        lineas_portes: Number(rows[0].lineas_portes || 0),
    };
}
