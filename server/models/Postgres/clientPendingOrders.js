import pool from '../../db/pool.js';
import {
    determinePendingSource,
    buildPendingOrdersQuery,
    buildPendingStatusCoverageQuery,
    groupPendingOrderLines,
} from '../../utils/clientPendingOrderQueries.js';

const TABLES = ['pedventa', 'pedventa_linea', 'albventa_linea'];
let cachedColumns = null;
let cacheExpires = 0;

async function discoverColumns() {
    if (cachedColumns && Date.now() < cacheExpires) return cachedColumns;
    const { rows } = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [TABLES]);
    const tables = Object.fromEntries(TABLES.map((name) => [name, new Map()]));
    for (const row of rows) {
        tables[row.table_name]?.set(row.column_name.toLowerCase(), row.column_name);
    }
    cachedColumns = tables;
    cacheExpires = Date.now() + 5 * 60 * 1000;
    return tables;
}


export class ClientPendingOrdersModel {
    static async getByClient({ codclien, page = 1, limit = 12 }) {
        const tables = await discoverColumns();
        const source = determinePendingSource(tables);
        if (!source) {
            const error = new Error(tables.pedventa_linea?.has('linservi')
                ? 'No es posible relacionar las líneas y sus estados (linservi) con los pedidos sincronizados.'
                : 'Faltan datos de servicio de pedidos para calcular cantidades pendientes.');
            error.code = 'PENDING_ORDERS_UNAVAILABLE';
            throw error;
        }
        const code = String(codclien).trim();
        let activeSource = source;
        const load = async (selectedSource) => {
            const sql = buildPendingOrdersQuery(tables, selectedSource);
            const result = await pool.query(sql, [code, limit + 1, (page - 1) * limit]);
            return result.rows;
        };
        let rows = await load(activeSource);

        if (activeSource.mode === 'status' && page === 1 && !rows.length) {
            const { rows: coverage } = await pool.query(buildPendingStatusCoverageQuery(tables), [code]);
            if (coverage[0]?.tiene_pedidos && !coverage[0]?.tiene_estados) {
                const error = new Error('Hay pedidos de este cliente, pero sus estados linservi todavía no están disponibles o no coinciden con las claves sincronizadas.');
                error.code = 'PENDING_ORDERS_UNAVAILABLE';
                throw error;
            }
        }

        // En modo linservi no hay fallback a estimaciones. La ausencia de P
        // significa que no hay líneas pendientes, aunque existan pedidos servidos.
        // Un sincronizador puede haber creado pedventa_linea sin haber cargado
        // todavía el historial de este cliente. No confundimos tabla vacía
        // con «no tiene pedidos pendientes» si hay otra fuente utilizable.
        if (page === 1 && !rows.length && activeSource.mode === 'served' && activeSource.table === 'pedventa_linea') {
            const realColumn = tables.pedventa_linea.get('codclien');
            const safeColumn = `"${realColumn.replace(/"/g, '""')}"`;
            const { rows: existing } = await pool.query(
                `SELECT 1 FROM public.pedventa_linea WHERE TRIM(${safeColumn}::text) = $1 LIMIT 1`,
                [code]
            );
            if (!existing.length) {
                const fallback = determinePendingSource({ ...tables, pedventa_linea: null });
                if (!fallback) {
                    // El cliente podría no haber realizado nunca un pedido.
                    // Solo mostramos el estado vacío si la tabla base confirma
                    // que no hay pedidos; de lo contrario, avisamos de falta de datos.
                    const base = tables.pedventa;
                    let hasAnyOrder = true;
                    if (base?.has('codclien')) {
                        const name = `"${base.get('codclien').replace(/"/g, '""')}"`;
                        const result = await pool.query(
                            `SELECT 1 FROM public.pedventa WHERE TRIM(${name}::text) = $1 LIMIT 1`, [code]
                        );
                        hasAnyOrder = result.rows.length > 0;
                    }
                    if (hasAnyOrder) {
                        const error = new Error('Las líneas de pedido aún no se han sincronizado para este cliente.');
                        error.code = 'PENDING_ORDERS_UNAVAILABLE';
                        throw error;
                    }
                } else {
                    activeSource = fallback;
                    rows = await load(activeSource);
                }
            }
        }

        const grouped = groupPendingOrderLines(rows, limit);
        return {
            ...grouped,
            page,
            source: activeSource.mode.startsWith('status') ? 'linservi' :
                activeSource.mode === 'albaranes' ? 'albaranes' : activeSource.table,
            isEstimate: activeSource.mode === 'albaranes' ||
                (!activeSource.reliableClosure && rows.some((row) => row.pendiente !== null)),
        };
    }
}
