/** Contratos estrictos para recepciones PP -> AP y recuentos de CDI. */
export class LogisticsError extends Error {
    constructor(status, code, message, uncertain = false) {
        super(message); this.name = 'LogisticsError'; this.status = status; this.code = code; this.uncertain = uncertain;
    }
}
const fail = (code, message, status = 400) => { throw new LogisticsError(status, code, message); };
export function textField(value, max, label, required = true) {
    if ((value === undefined || value === null || value === '') && !required) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) fail('SGA_INVALID_FIELD', `${label}: valor incorrecto.`);
    return value.trim();
}
export function amount(value, { signed = false, integer = false, allowZero = false } = {}) {
    const raw = String(value ?? '').replace(',', '.').trim();
    if (!/^-?\d{1,10}(?:\.\d{1,6})?$/.test(raw)) fail('SGA_INVALID_QUANTITY', 'Indica una cantidad válida, con hasta seis decimales.');
    const parts = raw.replace('-', '').split('.');
    const micro = (raw.startsWith('-') ? -1n : 1n) * (BigInt(parts[0]) * 1000000n + BigInt((parts[1] || '').padEnd(6, '0')));
    if ((!signed && micro < (allowZero ? 0n : 1n)) || (signed && micro === 0n && !allowZero)) fail('SGA_INVALID_QUANTITY', 'La diferencia o cantidad no puede ser cero.');
    if (integer && micro % 1000000n !== 0n) fail('SGA_INTEGER_REQUIRED', 'Este artículo se controla por unidades enteras.');
    return micro;
}
export function asDecimal(micro) {
    const neg = micro < 0n, n = neg ? -micro : micro;
    const fraction = String(n % 1000000n).padStart(6, '0').replace(/0+$/, '');
    return `${neg ? '-' : ''}${n / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
export function orderIdentity(value, type = 'PP') {
    if (value?.tipo !== type) fail('SGA_WRONG_DOCUMENT', `Selecciona un pedido ${type}.`);
    const anio = textField(value.anio, 4, 'Ejercicio');
    if (!/^\d{4}$/.test(anio)) fail('SGA_WRONG_YEAR', 'Ejercicio incorrecto.');
    return { tipo: type, anio, serie: textField(value.serie, 5, 'Serie'), clave: textField(value.clave, 10, 'Clave CDI') };
}
function pendingRows(response) {
    const rows = response?.lineas ?? response?.pedido?.lineas ?? response?.datos?.lineas;
    if (!Array.isArray(rows) || response?.cursor_siguiente || response?.despues || response?.hay_mas === true) {
        fail('SGA_PENDING_INCOMPLETE', 'CDI no ha devuelto todas las líneas pendientes. No se puede confirmar.', 422);
    }
    const token = response?.token ?? response?.pedido?.token ?? response?.datos?.token;
    if (typeof token !== 'string' || !token || token.length > 64) fail('SGA_PENDING_TOKEN', 'CDI no ha facilitado el token del pedido.', 422);
    return { rows, token };
}
export function buildPurchaseReceipt(input, pending) {
    const identity = orderIdentity(input.identity);
    const { rows, token } = pendingRows(pending);
    const known = new Map();
    for (const row of rows) {
        const id = textField(row?.idlinea, 40, 'Línea pendiente');
        if (known.has(id)) fail('SGA_PENDING_DUPLICATE', 'CDI ha repetido una línea pendiente.', 422);
        known.set(id, amount(String(row?.cantidad_pendiente ?? row?.pendiente ?? row?.cantidadPendiente ?? ''), { signed: true, allowZero: true }));
    }
    const selections = input?.lineas;
    if (!Array.isArray(selections) || !selections.length || selections.length > 500) fail('SGA_LINES_INVALID', 'Selecciona entre 1 y 500 líneas.');
    const sums = new Map(), lots = new Set(), noLotIndex = new Map();
    const lineas = [];
    for (const item of selections) {
        const idlinea = textField(item?.idlinea, 40, 'Línea');
        if (!known.has(idlinea)) fail('SGA_UNKNOWN_LINE', 'La línea seleccionada no está pendiente en CDI.', 409);
        const micro = amount(item.cantidad, { integer: item.unidades === true });
        sums.set(idlinea, (sums.get(idlinea) || 0n) + micro);
        const nserie = textField(item.nserie, 35, 'Lote', false);
        const ubicacion = textField(item.ubicacion, 10, 'Ubicación', false);
        // Una misma pieza no se puede recibir dos veces en el mismo envío.
        if (nserie) {
            const key = JSON.stringify([idlinea, nserie]);
            if (lots.has(key)) fail('SGA_DUPLICATE_LOT', 'Has introducido dos veces la misma pieza.');
            lots.add(key);
        }
        if (!nserie && !ubicacion && noLotIndex.has(idlinea)) {
            const pos = noLotIndex.get(idlinea);
            const old = amount(lineas[pos].cantidad);
            lineas[pos].cantidad = asDecimal(old + micro);
        } else {
            if (!nserie && !ubicacion) noLotIndex.set(idlinea, lineas.length);
            lineas.push({ idlinea, cantidad: asDecimal(micro), ...(nserie ? { nserie } : {}), ...(ubicacion ? { ubicacion } : {}) });
        }
    }
    for (const [id, micro] of sums) {
        if (known.get(id) < micro) fail('SGA_OVER_RECEIPT', `La cantidad supera el pendiente de la línea ${id}.`, 409);
    }
    const fecha = textField(input.fecha, 10, 'Fecha');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) fail('SGA_DATE', 'Fecha incorrecta.');
    const payload = { ...identity, token, fecha, serie_destino: textField(input.serie_destino, 5, 'Serie AP'), codalmacen: textField(input.codalmacen, 2, 'Almacén'), lineas };
    return { identity, payload, before: { token, pending: [...known].map(([idlinea, qty]) => ({ idlinea, cantidad: asDecimal(qty) })) } };
}
export function buildInventoryAdjustment(input, stock) {
    const codarticulo = textField(input?.codarticulo, 20, 'Artículo');
    const codalmacen = textField(input?.codalmacen, 2, 'Almacén');
    const nserie = textField(input?.nserie, 35, 'Lote', false);
    const codubicacion = textField(input?.codubicacion, 10, 'Ubicación', false);
    const counted = amount(input?.contado, { signed: true, integer: input.unidades === true, allowZero: true });
    if (counted < 0n) fail('SGA_NEGATIVE_COUNT', 'No puedes contar existencias negativas.');
    if (input?.confirmado !== true) fail('SGA_COUNT_UNCONFIRMED', 'Confirma que has comprobado físicamente el recuento.');
    if (input?.dobleComprobacion !== true && input?.esperado !== input?.contado) fail('SGA_SECOND_COUNT', 'Confirma la segunda comprobación física.');
    // CDI no documenta el nombre exacto del saldo en cada respuesta de su proveedor.
    // Solo permitir escritura si el saldo exacto/único se puede probar con respuesta CDI.
    if (stock?.cursor_siguiente || stock?.despues || stock?.hay_mas === true) fail('SGA_STOCK_INCOMPLETE', 'Faltan páginas de existencias. Relee antes de regularizar.', 422);
    const rows = stock?.existencias;
    if (!Array.isArray(rows)) fail('SGA_STOCK_UNKNOWN', 'No se reconoce la respuesta de existencias CDI.', 422);
    const selected = rows.filter((row) => String(row?.codarticulo ?? '') === codarticulo && String(row?.codalmacen ?? '') === codalmacen
        && String(row?.nserie ?? '') === (nserie || '') && String(row?.codubicacion ?? '') === (codubicacion || ''));
    if (selected.length !== 1) fail('SGA_STOCK_AMBIGUOUS', 'No hay un único saldo identificable. Revisa lote, ubicación y configuraciones.', 422);
    const row = selected[0];
    // Conservador: no adivinar nombres de saldo. La forma exacta se valida con CDI real.
    const expectedValue = row?.existencias ?? row?.saldo;
    if (expectedValue === undefined || expectedValue === null) fail('SGA_STOCK_BALANCE_UNKNOWN', 'CDI no indica el saldo en un campo reconocido. Necesitamos validar su respuesta.', 422);
    const before = amount(String(expectedValue), { signed: true, allowZero: true });
    if (before < 0n) fail('SGA_STOCK_NEGATIVE', 'CDI devuelve un saldo negativo. Requiere revisión.', 422);
    if (textField(input.esperado, 32, 'Saldo esperado') !== asDecimal(before)) fail('SGA_STOCK_STALE', 'El stock ha cambiado desde que empezaste el recuento.', 409);
    const difference = counted - before;
    if (difference === 0n) fail('SGA_STOCK_NO_CHANGE', 'El recuento coincide. No hay regularización.');
    if (difference < 0n) {
        const reservedValue = row?.reservado ?? row?.reservas;
        if (reservedValue === undefined || reservedValue === null) fail('SGA_RESERVATIONS_UNKNOWN',
            'No podemos confirmar las reservas CDI. No se permitirá una reducción de stock.', 422);
        const reserved = amount(String(reservedValue), { signed: true, allowZero: true });
        if (reserved < 0n || counted < reserved) fail('SGA_RESERVED_STOCK',
            'El recuento es inferior al stock reservado. Revisa primero las reservas.', 409);
    }
    const date = textField(input.fecha, 10, 'Fecha');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('SGA_DATE', 'Fecha incorrecta.');
    const note = textField(input.motivo, 500, 'Motivo');
    const payload = { tipo: 'INVENTARIO', origen: 'SGA', referencia: '', fecha: date, observaciones: note,
        lineas: [{ codarticulo, codalmacen, cantidad: asDecimal(difference), existencias_esperadas: asDecimal(before),
            ...(nserie ? { nserie } : {}), ...(codubicacion ? { codubicacion } : {}), ...(row?.idconf ? { idconf: String(row.idconf) } : {}) }] };
    return { payload, before: { codarticulo, codalmacen, nserie: nserie || null, codubicacion: codubicacion || null, esperado: asDecimal(before), contado: asDecimal(counted), diferencia: asDecimal(difference) } };
}

/** Control de lote/unidades determinado por el MAESTRO real, no por casillas del navegador. */
export function validateReceiptMasters(input, pending, masterByCode) {
    const rows = pending?.lineas ?? pending?.pedido?.lineas ?? pending?.datos?.lineas;
    if (!Array.isArray(rows)) fail('SGA_PENDING_INCOMPLETE', 'Líneas CDI no reconocidas.', 422);
    const byLine = new Map(rows.map((r) => [String(r.idlinea), String(r.codarticulo || r.codprodu || '')]));
    const usedLot = new Set();
    for (const item of input.lineas || []) {
        const codarticulo = byLine.get(item.idlinea);
        if (!codarticulo) fail('SGA_ARTICLE_UNMAPPED', 'No podemos relacionar la línea con un artículo CDI. Requiere validar el mapeo.', 422);
        const article = masterByCode[codarticulo];
        if (!article || article.codarticulo !== codarticulo) fail('SGA_MASTER_UNVERIFIED', `No se ha podido verificar el maestro de ${codarticulo}.`, 422);
        const lotFlag = article.exilote;
        const hasLots = lotFlag === true || ['S', '1', 'SI'].includes(String(lotFlag).toUpperCase());
        const noLots = lotFlag === false || ['N', '0', 'NO'].includes(String(lotFlag).toUpperCase());
        if (!hasLots && !noLots) fail('SGA_LOT_FLAG_UNKNOWN', 'CDI no identifica de forma inequívoca si el artículo controla lotes.', 422);
        if (hasLots && !item.nserie) fail('SGA_LOT_REQUIRED', `El artículo ${codarticulo} exige escanear lote.`, 422);
        if (noLots && item.nserie) fail('SGA_LOT_FORBIDDEN', `El artículo ${codarticulo} no utiliza lotes.`, 422);
        if (hasLots) {
            const key = `${codarticulo}|${String(item.nserie).toUpperCase()}`;
            if (usedLot.has(key)) fail('SGA_DUPLICATE_LOT', 'Una misma pieza física aparece dos veces en la recepción.');
            usedLot.add(key);
        }
        const unit = String(article.umedidac || '').toUpperCase().trim();
        if (['UD', 'UDS', 'UN', 'UNIDAD', 'UNIDADES', 'PZA', 'PZ'].includes(unit)) amount(item.cantidad, { integer: true });
        const locationFlag = article.exiubicacion;
        if ((locationFlag === true || String(locationFlag).toUpperCase() === 'S') && !item.ubicacion) {
            fail('SGA_LOCATION_REQUIRED', `El artículo ${codarticulo} exige ubicación.`, 422);
        }
        if (article.exiconf === true || String(article.exiconf).toUpperCase() === 'S') {
            fail('SGA_CONFIGURED_ARTICLE', 'Artículo configurado: se necesita validar su idconf con CDI antes de recepcionar.', 422);
        }
    }
    return true;
}

/** Antes de regularizar, verificar la configuración física del artículo y de su unidad CDI. */
export function validateInventoryMaster(input, article, unit) {
    if (!article || article.codarticulo !== input.codarticulo) fail('SGA_MASTER_UNVERIFIED', 'No se pudo identificar el artículo de CDI.', 422);
    const usesLots = article.exilote === true || ['S','SI','1'].includes(String(article.exilote).toUpperCase());
    const noLots = article.exilote === false || ['N','NO','0'].includes(String(article.exilote).toUpperCase());
    if (!usesLots && !noLots) fail('SGA_LOT_FLAG_UNKNOWN', 'CDI no ha confirmado si el artículo controla lotes.', 422);
    if (usesLots && !input.nserie) fail('SGA_LOT_REQUIRED', 'Debes seleccionar el lote que estás contando.', 422);
    if (noLots && input.nserie) fail('SGA_LOT_FORBIDDEN', 'Este artículo no utiliza lotes.', 422);
    if ((article.exiconf === true || String(article.exiconf).toUpperCase() === 'S')) fail('SGA_CONFIGURED_ARTICLE', 'Falta validar la configuración idconf.', 422);
    if ((article.exiubicacion === true || String(article.exiubicacion).toUpperCase() === 'S') && !input.codubicacion) fail('SGA_LOCATION_REQUIRED', 'Este artículo exige una ubicación.', 422);
    if (!unit || String(unit.umedida || '') !== String(article.umedidac || '')) fail('SGA_UNIT_UNKNOWN', 'No podemos confirmar la unidad base CDI.', 422);
    const flag = unit.actualizaexist;
    const controlsStock = flag === true || ['S', 'SI', '1'].includes(String(flag).toUpperCase());
    const doesNotControl = flag === false || ['N', 'NO', '0'].includes(String(flag).toUpperCase());
    if (doesNotControl) fail('SGA_NO_STOCK_CONTROL', 'El producto no actualiza existencias: no se debe regularizar stock.', 422);
    if (!controlsStock) fail('SGA_STOCK_CONTROL_UNKNOWN', 'No se ha confirmado el control de existencias.', 422);
    const base = String(article.umedidac || '').toUpperCase().trim();
    if (['UD', 'UDS', 'UN', 'UNIDAD', 'UNIDADES', 'PZA', 'PZ'].includes(base)) {
        amount(input.contado, { signed: true, allowZero: true, integer: true });
    }
    return true;
}
