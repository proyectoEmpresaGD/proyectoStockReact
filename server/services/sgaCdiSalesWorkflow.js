/**
 * Contrato de aceptación de PC -> AC. Puro y sin IO.
 * Los campos de pendientes/documentos aún han de contrastarse con respuestas CDI reales.
 * Ante ambigüedad no confirma el albarán ni habilita el traspaso a facturación.
 */
import { CdiTestError } from './cdiTestClient.js';

const reject = (code, message, status = 400) => { throw new CdiTestError(status, code, message); };
const clean = (v, field, max, mandatory = true) => {
    if ((v === undefined || v === null || v === '') && !mandatory) return undefined;
    if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x1f]/.test(v)) reject('CDI_FLOW_INVALID_FIELD', `Campo ${field} no válido.`);
    return v.trim();
};
const units = (v) => {
    const value = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
    if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(value)) reject('CDI_FLOW_INVALID_QUANTITY', 'Cantidad inválida: máximo seis decimales y punto decimal.');
    const [w, f = ''] = value.split('.');
    return BigInt(w) * 1000000n + BigInt(f.padEnd(6, '0'));
};
const decimal = (n) => {
    const fraction = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    return `${n / 1000000n}${fraction ? `.${fraction}` : ''}`;
};
const pendingLines = (value) => {
    const result = value?.lineas ?? value?.pedido?.lineas ?? value?.datos?.lineas;
    if (!Array.isArray(result)) reject('CDI_FLOW_PENDING_UNKNOWN', 'CDI no devuelve una lista de líneas pendientes reconocible; envío bloqueado.', 422);
    return result;
};
const idOf = (line) => String(line?.idlinea ?? '');
const pendingOf = (line) => {
    const value = line?.cantidad_pendiente ?? line?.pendiente ?? line?.cantidadPendiente;
    if (value === undefined || value === null) reject('CDI_FLOW_PENDING_QUANTITY_UNKNOWN', 'CDI no informa la cantidad pendiente de una línea; envío bloqueado.', 422);
    return units(value);
};
const skuOf = (line) => {
    const value = line?.codarticulo ?? line?.articulo?.codarticulo;
    return typeof value === 'string' && value.length <= 20 && value ? value : null;
};
const parseOrder = (input) => {
    const tipo = clean(input?.tipo, 'tipo', 2);
    if (tipo !== 'PC') reject('CDI_FLOW_ONLY_SALES', 'Este circuito guiado es exclusivamente de pedidos de venta PC.');
    const anio = clean(input?.anio, 'anio', 4);
    if (!/^\d{4}$/.test(anio)) reject('CDI_FLOW_YEAR', 'Ejercicio inválido.');
    return { tipo, anio, serie: clean(input?.serie, 'serie', 5), clave: clean(input?.clave, 'clave', 10) };
};

/** Preflight estricto: una página incompleta o fallo de CDI no debe generar un AC.
 * La API no garantiza una foto global si todavía existe cursor_siguiente.
 */
export function assertCompleteSalesPending(value) {
    if (value?.ok !== true) reject('CDI_FLOW_PENDING_NOT_CONFIRMED',
        'CDI no confirma la lectura de pendientes. No se enviará ningún albarán.', 422);
    if (value.cursor_siguiente || value.cursor || value.hay_mas === true) {
        reject('CDI_FLOW_PENDING_PAGINATED',
            'CDI ha devuelto solo parte de las líneas pendientes. Debe completarse la consulta antes de generar un albarán.', 409);
    }
    const token = value.token ?? value.pedido?.token ?? value.datos?.token;
    if (typeof token !== 'string' || !token || token.length > 64) reject('CDI_FLOW_TOKEN_UNKNOWN',
        'CDI no facilita el token de versión del pedido. No se puede preparar el albarán.', 422);
    const rows = salesPendingRows(value);
    const ids = new Set(rows.map((line) => line.idlinea));
    if (ids.size !== rows.length) reject('CDI_FLOW_DUPLICATE_PENDING_ID',
        'CDI devuelve líneas duplicadas; es necesario revisar el pedido.', 422);
    return rows;
}

export function salesPendingRows(value) {
    return pendingLines(value).map((line) => {
        const idlinea = idOf(line);
        if (!idlinea) reject('CDI_FLOW_ID_MISSING', 'Falta el ID estable de una línea de pedido.', 422);
        return { idlinea, codarticulo: skuOf(line), cantidad_pendiente: decimal(pendingOf(line)), original: line };
    });
}

export function buildSalesPicking(input, pending) {
    const identity = parseOrder(input);
    const fecha = clean(input?.fecha, 'fecha', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(`${fecha}T00:00:00Z`))
        || new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) reject('CDI_FLOW_DATE', 'Fecha inválida.');
    const serie_destino = clean(input?.serie_destino, 'serie_destino', 5);
    const codalmacen = clean(input?.codalmacen, 'codalmacen', 2);
    const token = pending?.token ?? pending?.pedido?.token ?? pending?.datos?.token;
    if (typeof token !== 'string' || !token.length || token.length > 64) reject('CDI_FLOW_TOKEN_UNKNOWN', 'Falta el token actual del pedido.', 422);
    const choices = input?.lineas;
    if (!Array.isArray(choices) || choices.length < 1 || choices.length > 100) reject('CDI_FLOW_LINE_COUNT', 'Selecciona de 1 a 100 cortes/líneas.');
    const currentRows = assertCompleteSalesPending(pending);
    const current = new Map(currentRows.map((line) => [line.idlinea, line]));
    if (current.size !== currentRows.length) reject('CDI_FLOW_DUPLICATE_PENDING_ID', 'CDI devuelve identificadores de línea repetidos.', 422);
    const used = new Set();
    const totals = new Map();
    const rows = [];
    // CDI expects a single order-line reference when an article has no lot or
    // location. Operators may enter several unit counts; consolidate those
    // entries before invoking pedidos.servir, which rejects duplicate IDs.
    const noLotIndex = new Map();
    for (const choice of choices) {
        const idlinea = clean(choice?.idlinea, 'idlinea', 40);
        if (!current.has(idlinea)) reject('CDI_FLOW_UNKNOWN_LINE', `La línea ${idlinea} ya no está pendiente en CDI.`, 409);
        const count = units(choice?.cantidad);
        if (count <= 0n) reject('CDI_FLOW_ZERO_QUANTITY', 'Cada cantidad debe ser mayor de cero.');
        const nserie = clean(choice?.nserie, 'nserie', 35, false);
        const ubicacion = clean(choice?.ubicacion, 'ubicacion', 10, false);
        const isUntrackedSelection = !nserie && !ubicacion;
        if (isUntrackedSelection && noLotIndex.has(idlinea)) {
            const position = noLotIndex.get(idlinea);
            rows[position].cantidad = decimal(units(rows[position].cantidad) + count);
        } else {
            // Still reject repeated pieces/locations: two scans of the same
            // tracked physical piece must not silently double the shipped stock.
            const key = JSON.stringify([idlinea, nserie || '', ubicacion || '']);
            if (used.has(key)) reject('CDI_FLOW_DUPLICATE_CUT', `Has añadido dos veces el mismo corte de ${idlinea}.`);
            used.add(key);
            if (isUntrackedSelection) noLotIndex.set(idlinea, rows.length);
            rows.push({ idlinea, cantidad: decimal(count), ...(nserie ? { nserie } : {}), ...(ubicacion ? { ubicacion } : {}) });
        }
        totals.set(idlinea, (totals.get(idlinea) || 0n) + count);
    }
    const beforeLines = [...totals].map(([idlinea, qty]) => {
        const line = current.get(idlinea);
        const previous = units(line.cantidad_pendiente);
        if (qty > previous) reject('CDI_FLOW_EXCEEDS_PENDING', `La cantidad de ${idlinea} excede lo pendiente en CDI.`, 409);
        return { idlinea, codarticulo: line.codarticulo, cantidad_pendiente: decimal(previous), cantidad_solicitada: decimal(qty), expected_after: decimal(previous - qty) };
    });
    const write = { ...identity, token, fecha, serie_destino, codalmacen, lineas: rows };
    return { write, before: { identity, lines: beforeLines, selections: rows, token } };
}

export function verifySalesPending(before, after) {
    // Las líneas ausentes solo representan saldo cero si CDI ha devuelto la lista
    // COMPLETA. Un cursor pendiente o un formato ambiguo nunca aprueba un AC.
    const inconclusive = (note) => ({ pendingMatches: false, lines: [], note });
    if (after?.ok !== true) return inconclusive('CDI no confirma una lectura válida de pendientes.');
    if (after?.cursor_siguiente || after?.cursor || after?.hay_mas === true) return inconclusive('El listado de pendientes está paginado; concilia todas sus páginas antes de aprobar el albarán.');
    if (!Array.isArray(before?.lines) || before.lines.length === 0) return inconclusive('No hay líneas originales para comparar.');
    let rows;
    try { rows = salesPendingRows(after); }
    catch (e) { return inconclusive(e.message); }
    const map = new Map(rows.map((row) => [row.idlinea, row]));
    if (map.size !== rows.length) return inconclusive('CDI ha devuelto identificadores de línea repetidos en los pendientes.');
    try {
        const results = before.lines.map((item) => {
            const actual = map.get(item.idlinea)?.cantidad_pendiente ?? '0';
            return { idlinea: item.idlinea, expected: item.expected_after, actual, matches: units(actual) === units(item.expected_after) };
        });
        return { pendingMatches: results.every((item) => item.matches), lines: results };
    } catch (e) { return inconclusive(`No se pueden comparar las cantidades: ${e.message}`); }
}

export function resultingAlbaran(response, sourceIdentity) {
    const document = response?.albaran ?? response?.documento ?? response?.documento_generado;
    if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
    const { tipo, anio, serie, clave } = document;
    if (tipo !== 'AC' || typeof anio !== 'string' || !/^\d{4}$/.test(anio)
        || typeof serie !== 'string' || !serie || serie.length > 5
        || typeof clave !== 'string' || !clave || clave.length > 10
        || sourceIdentity?.tipo !== 'PC') return null;
    return { tipo, anio, serie, clave };
}

const equalIdentity = (a, b) => Boolean(a && b && ['tipo', 'anio', 'serie', 'clave'].every((key) => String(a[key]) === String(b[key])));

export function assessSalesHandoff(record) {
    const source = record?.before_data ?? record?.before;
    const response = record?.result_data ?? record?.response;
    const document = record?.document_data ?? record?.document;
    const identity = record?.document_identity ?? record?.documentIdentity;
    const verification = record?.verification_data ?? record?.verification;
    const reason = (code, message, extra = {}) => ({ status: code, message, invoiceCreated: false, ...extra });
    if (source?.identity?.tipo !== 'PC') return reason('NOT_SALES', 'Las recepciones de compra no pasan al circuito de facturación de clientes.');
    if (!response || response.ok !== true) return reason('WAITING_ERP_CONFIRMATION', 'Todavía no existe una confirmación inequívoca del envío.');
    const official = resultingAlbaran(response, source.identity);
    if (!official) return reason('CHECK_DOCUMENT_REFERENCE', 'La respuesta no identifica de forma completa el albarán generado; consulta su referencia en CDI.');
    if (!equalIdentity(official, identity) || !document) return reason('CHECK_DOCUMENT_READBACK', 'Hay que releer el albarán generado desde CDI para verificarlo.', { albaran: official });
    if (document.ok !== true || (document.tipo && document.tipo !== 'AC')) return reason('CHECK_DOCUMENT_TYPE', 'El documento obtenido no es un albarán de cliente válido.');
    // El almacén enviado forma parte de la operación logística. No declaramos el
    // AC validado si CDI no permite contrastar su almacén real.
    const requestedWarehouse = record?.write_data?.codalmacen ?? record?.write?.codalmacen;
    if (requestedWarehouse) {
        const confirmedWarehouse = document?.cabecera && !Array.isArray(document.cabecera)
            ? document.cabecera.codalmacen : undefined;
        if (!confirmedWarehouse || String(confirmedWarehouse) !== String(requestedWarehouse)) {
            return reason('CHECK_WAREHOUSE', 'No se ha podido verificar el almacén del albarán contra el almacén solicitado. Revisa el AC oficial.', { albaran: official });
        }
    }
    if (!verification?.pendingMatches) return reason('CHECK_PENDING', 'El pendiente del pedido no coincide con lo preparado.');
    // La API solo garantiza "lineas"; no especifica los campos internos en la referencia entregada.
    // No damos por hecho que el albarán pertenece a este pedido basándonos únicamente en el número.
    const expected = source.selections;
    if (!Array.isArray(expected) || !expected.length || !Array.isArray(document.lineas)) {
        return reason('MANUAL_DOCUMENT_REVIEW', 'Faltan campos documentados para cotejar automáticamente artículo, lote y cantidad; revisa el albarán en CDI.', { albaran: official });
    }
    const skuByLine = new Map((source.lines || []).map((item) => [item.idlinea, item.codarticulo]));
    const used = new Set();
    for (const choice of expected) {
        const sku = skuByLine.get(choice.idlinea);
        if (!sku) return reason('MANUAL_DOCUMENT_REVIEW', 'CDI no facilitó código de artículo en pendientes; verifica el origen y cantidades en el ERP.', { albaran: official });
        const pos = document.lineas.findIndex((candidate, i) => {
            if (used.has(i) || candidate?.codarticulo !== sku) return false;
            if (candidate?.cantidad === undefined || candidate?.cantidad === null) return false;
            try { if (units(candidate.cantidad) !== units(choice.cantidad)) return false; }
            catch { return false; }
            if (choice.nserie && candidate.nserie !== choice.nserie) return false;
            if (choice.ubicacion && candidate.ubicacion !== choice.ubicacion && candidate.codubicacion !== choice.ubicacion) return false;
            return true;
        });
        if (pos < 0) return reason('DOCUMENT_LINES_MISMATCH', 'Los artículos, lotes o cantidades del albarán no coinciden con los cortes confirmados.', { albaran: official });
        used.add(pos);
    }
    // Una preparación puede consumir por completo SUS líneas y dejar otras del mismo pedido pendientes.
    // Solo consideramos completo el pedido cuando el listado posterior entero es reconocible y no queda saldo.
    let orderCompleted = false;
    try {
        const later = record?.after_data ?? record?.after;
        const allPending = salesPendingRows(later);
        orderCompleted = !later?.cursor_siguiente && !later?.cursor && later?.hay_mas !== true && allPending.every((item) => units(item.cantidad_pendiente) === 0n);
    } catch { /* Desconocido => nunca inferir cierre completo. */ }
    return reason('READY_FOR_ERP_INVOICING', 'Albarán AC verificado por lectura posterior. Administración puede revisarlo y facturarlo en CDI Gest; NO se ha emitido ninguna factura.', { albaran: official, orderCompleted });
}
