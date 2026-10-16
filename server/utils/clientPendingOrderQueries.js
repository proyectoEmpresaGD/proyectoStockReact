const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const column = (columns, name, alias = 'p') => columns?.has(name) ? `${alias}.${quote(columns.get(name))}` : null;
const asText = (sql) => sql ? `TRIM(${sql}::text)` : `''::text`;
const asQuantity = (sql) => sql ? `COALESCE(${sql}::numeric, 0)` : '0::numeric';
const asDate = (sql) => sql ? `${sql}::timestamp` : 'NULL::timestamp';

/** Una línea técnica o informativa no constituye un producto pendiente.
 * No filtramos por precio: una línea sin coste puede ser un producto real.
 */
function realProductFilter(columns, alias = 'p') {
    const product = column(columns, 'codprodu', alias);
    const quantity = column(columns, 'cantidad', alias);
    if (!product || !quantity) return 'FALSE';
    return `${asText(product)} <> '' AND ${asQuantity(quantity)} > 0`;
}


/**
 * linservi es la fuente de verdad: P = pendiente, S = servido.
 * pedventa proporciona el cliente y los datos comerciales de cada línea;
 * pedventa_linea aporta el estado sin multiplicar filas si hay duplicados.
 */
export function determinePendingSource(tables) {
    const order = tables.pedventa;
    const line = tables.pedventa_linea;
    const orderKeys = ['codclien', 'codserpedventa', 'npedventa', 'linea', 'codprodu', 'cantidad'];
    const lineKeys = ['codserpedventa', 'npedventa', 'linea', 'codprodu', 'cantidad', 'linservi'];

    if (line?.has('linservi')) {
        if (order && orderKeys.every((key) => order.has(key)) && lineKeys.every((key) => line.has(key))) {
            return { table: 'pedventa', mode: 'status', reliableClosure: order.has('cancerrada') };
        }
        // Algunas sincronizaciones solo incorporan los datos en pedventa_linea.
        if (['codclien', 'codserpedventa', 'npedventa', 'linea', 'codprodu', 'cantidad', 'linservi']
            .every((key) => line.has(key))) {
            return { table: 'pedventa_linea', mode: 'status-direct', reliableClosure: line.has('cancerrada') };
        }
        // Si existe linservi, nunca sustituimos su estado por una estimación
        // obtenida de albaranes: podría incluir pedidos ya servidos.
        return null;
    }

    const required = [...orderKeys, 'cantidad'];
    if (line && required.every((key) => line.has(key)) && line.has('canservi')) {
        return { table: 'pedventa_linea', mode: 'served', reliableClosure: line.has('cancerrada') };
    }
    if (order && required.every((key) => order.has(key))) {
        if (order.has('canservi')) {
            return { table: 'pedventa', mode: 'served', reliableClosure: order.has('cancerrada') };
        }
        const delivery = tables.albventa_linea;
        if (delivery && ['codclien', 'codserpedventa', 'npedventa', 'nrbpedvenlinea', 'cantidad']
            .every((key) => delivery.has(key))) {
            return { table: 'pedventa', mode: 'albaranes', reliableClosure: false };
        }
    }
    return null;
}

function pendingStatusFilter(tables, orderColumns, pendingOnly = true) {
    const lineColumns = tables.pedventa_linea;
    const match = ['codserpedventa', 'npedventa', 'linea', 'canal', 'ejercicio', 'empresa', 'codclien', 'codprodu']
        .filter((key) => lineColumns.has(key) && orderColumns.has(key))
        .map((key) => `${asText(column(lineColumns, key, 'l'))} = ${asText(column(orderColumns, key, 'p'))}`);
    return `EXISTS (
        SELECT 1 FROM public.pedventa_linea l
        WHERE ${match.join('\n          AND ')}
          AND ${realProductFilter(lineColumns, 'l')}
          AND UPPER(TRIM(${column(lineColumns, 'linservi', 'l')}::text)) ${pendingOnly ? "= 'P'" : "IN ('P', 'S')"}
    )`;
}

/** Si los pedidos existen pero ningún estado S/P enlaza con ellos,
 * no presentamos un resultado vacío que podría ocultar referencias pendientes. */
export function buildPendingStatusCoverageQuery(tables) {
    const columns = tables.pedventa;
    const customer = asText(column(columns, 'codclien'));
    const realProduct = realProductFilter(columns);
    return `SELECT
        EXISTS (SELECT 1 FROM public.pedventa p
                WHERE ${customer} = $1 AND ${realProduct}) AS tiene_pedidos,
        EXISTS (SELECT 1 FROM public.pedventa p
                WHERE ${customer} = $1 AND ${realProduct}
                  AND ${pendingStatusFilter(tables, columns, false)}) AS tiene_estados`;
}

export function buildPendingOrdersQuery(tables, source) {
    const columns = tables[source.table];
    const field = (name) => column(columns, name);
    const isStatus = source.mode === 'status' || source.mode === 'status-direct';
    const quantity = asQuantity(field('cantidad'));
    const servedColumn = field('canservi');
    const served = isStatus ? (servedColumn ? `${servedColumn}::numeric` : 'NULL::numeric')
        : source.mode === 'served' ? asQuantity(servedColumn) : 'COALESCE(a.entregado, 0)';
    const closed = source.mode === 'served' && source.reliableClosure
        ? asQuantity(field('cancerrada')) : '0::numeric';
    const pending = isStatus
        // Estado P fiable, pero no inventamos cantidades pendientes si no hay
        // cantidad servida. Ni un P ni un NULL equivalen a "nada servido".
        ? (servedColumn ? `CASE WHEN ${servedColumn} IS NOT NULL AND ${quantity} > (${served} + ${asQuantity(field('cancerrada'))})
            THEN GREATEST(${quantity} - ${served} - ${asQuantity(field('cancerrada'))}, 0::numeric)
            ELSE NULL::numeric END` : 'NULL::numeric')
        : `GREATEST(${quantity} - ${served} - ${closed}, 0::numeric)`;

    const statusWhere = source.mode === 'status'
        ? `AND ${pendingStatusFilter(tables, columns)}`
        : source.mode === 'status-direct'
            ? `AND UPPER(TRIM(${field('linservi')}::text)) = 'P'`
            : '';

    const lines = `
        SELECT
            ${asText(field('canal'))} AS canal,
            ${asText(field('ejercicio'))} AS ejercicio,
            ${asText(field('codserpedventa'))} AS serie,
            ${asText(field('npedventa'))} AS numero,
            ${asText(field('linea'))} AS linea,
            ${asDate(field('fecha'))} AS fecha,
            ${asDate(field('fecentre'))} AS entrega,
            ${asText(field('codprodu'))} AS codprodu,
            ${field('desprodu') ? `${field('desprodu')}::text` : `''::text`} AS desprodu,
            ${quantity} AS cantidad,
            ${served} AS servido,
            ${pending} AS pendiente,
            ${asQuantity(field('precio'))} AS precio,
            ${asQuantity(field('dt1'))} AS dt1,
            ${asQuantity(field('dt2'))} AS dt2,
            ${asQuantity(field('dt3'))} AS dt3
        FROM public.${quote(source.table)} p
        ${source.mode === 'albaranes' ? `LEFT JOIN entregas a ON
              a.codclien = ${asText(field('codclien'))}
          AND a.serie = ${asText(field('codserpedventa'))}
          AND a.numero = ${asText(field('npedventa'))}
          AND a.linea = ${asText(field('linea'))}
          ${tables.albventa_linea.has('canal') && columns.has('canal') ? `AND a.canal = ${asText(field('canal'))}` : ''}
          ${tables.albventa_linea.has('ejercicio') && columns.has('ejercicio') ? `AND a.ejercicio = ${asText(field('ejercicio'))}` : ''}` : ''}
        WHERE ${asText(field('codclien'))} = $1
          AND ${realProductFilter(columns)}
        ${statusWhere}
    `;

    let cte = '';
    if (source.mode === 'albaranes') {
        const delivery = tables.albventa_linea;
        const f = (name) => column(delivery, name, 'd');
        cte = `entregas AS (
            SELECT ${asText(f('codclien'))} AS codclien,
                ${asText(f('codserpedventa'))} AS serie,
                ${asText(f('npedventa'))} AS numero,
                ${asText(f('nrbpedvenlinea'))} AS linea,
                ${asText(tables.albventa_linea.has('canal') && columns.has('canal') ? f('canal') : null)} AS canal,
                ${asText(tables.albventa_linea.has('ejercicio') && columns.has('ejercicio') ? f('ejercicio') : null)} AS ejercicio,
                SUM(${asQuantity(f('cantidad'))}) AS entregado
            FROM public.albventa_linea d
            WHERE ${asText(f('codclien'))} = $1
              AND ${f('npedventa')} IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5, 6
        ),`;
    }

    // Se pagina por pedido, NO por líneas. No separar líneas del mismo pedido.
    // Con linservi, filtramos P y artículos reales, nunca por su precio ni por pendientes estimados.
    return `WITH ${cte}
        lineas AS (${lines}),
        pendientes AS (SELECT * FROM lineas ${isStatus ? '' : 'WHERE pendiente > 0'}),
        pedidos_paginados AS (
            SELECT canal, ejercicio, serie, numero, MAX(fecha) AS fecha_pedido
            FROM pendientes
            GROUP BY canal, ejercicio, serie, numero
            ORDER BY fecha_pedido DESC NULLS LAST, serie DESC, numero DESC
            LIMIT $2 OFFSET $3
        )
        SELECT p.* FROM pendientes p
        JOIN pedidos_paginados o USING (canal, ejercicio, serie, numero)
        ORDER BY o.fecha_pedido DESC NULLS LAST, p.serie DESC, p.numero DESC,
                 p.linea COLLATE "C" ASC
    `;
}

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function groupPendingOrderLines(rows, pageSize) {
    const map = new Map();
    for (const row of rows) {
        // Defensa adicional ante sincronizaciones incompletas o respuestas antiguas:
        // ni encabezados, ni observaciones, ni líneas con cantidad cero.
        if (!String(row.codprodu ?? '').trim() || !(Number(row.cantidad) > 0)) continue;
        const id = [row.canal, row.ejercicio, row.serie, row.numero].join('|');
        if (!map.has(id)) {
            map.set(id, {
                id,
                canal: row.canal,
                ejercicio: row.ejercicio,
                serie: row.serie,
                numero: row.numero,
                fecha: row.fecha,
                lineas: [],
                cantidadPendiente: 0,
                importePendiente: 0,
            });
        }
        const order = map.get(id);
        const known = row.pendiente !== null && row.pendiente !== undefined && row.pendiente !== '';
        const pending = known && Number.isFinite(Number(row.pendiente))
            ? Math.max(0, Number(row.pendiente)) : null;
        const discount = [row.dt1, row.dt2, row.dt3].reduce(
            (product, value) => product * (1 - Math.min(Math.max(Number(value) || 0, 0), 100) / 100), 1
        );
        const amount = pending === null ? null : round(pending * (Number(row.precio) || 0) * discount);
        order.lineas.push({
            linea: row.linea,
            codprodu: row.codprodu,
            desprodu: row.desprodu,
            fechaEntrega: row.entrega,
            cantidad: Number(row.cantidad) || 0,
            servido: row.servido === null || row.servido === undefined ? null : Number(row.servido),
            pendiente: pending,
            importePendiente: amount,
        });
        order.cantidadPendiente = order.cantidadPendiente === null || pending === null
            ? null : order.cantidadPendiente + pending;
        order.importePendiente = order.importePendiente === null || amount === null
            ? null : order.importePendiente + amount;
    }
    const orders = [...map.values()];
    return {
        orders: orders.slice(0, pageSize).map((order) => ({
            ...order,
            cantidadPendiente: order.cantidadPendiente === null ? null : round(order.cantidadPendiente),
            importePendiente: order.importePendiente === null ? null : round(order.importePendiente),
        })),
        hasMore: orders.length > pageSize,
    };
}
