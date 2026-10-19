/**
 * SGA · Preparación de pedidos, exclusivamente en memoria en esta fase.
 * Las cantidades usan centésimas enteras (metros con dos decimales).
 * Cada corte de tejido genera exactamente 0,10 m de merma interna.
 * Un corte de 4,50 m consume 4,60 m, aunque al cliente solo van 4,50 m.
 */
import { toHundredths, fromHundredths } from './sgaRules.js';

export const CUT_WASTE_HUNDREDTHS = 10; // 0,10 m por corte de tejido, valor fijo.
export const SMALL_REMAINDER_HUNDREDTHS = 50; // aviso con resto positivo <= 0,50 m.
export const REMAINDER_ACTIONS = Object.freeze({ KEEP: 'conservar', ZERO: 'regularizar_cero', QUALITY: 'quality', CONFECCION: 'confeccion' });
// Códigos de destino ficticios: sustituir por los códigos reales al integrar el ERP.
export const REMAINDER_DESTINATIONS = Object.freeze({
    [REMAINDER_ACTIONS.QUALITY]: { code: 'DEMO-QUALITY', name: 'Almacén de Quality' },
    [REMAINDER_ACTIONS.CONFECCION]: { code: 'DEMO-CONFECCION', name: 'Almacén de Confección' },
});
export const getAutomaticWaste = (product) => product?.unit === 'm' ? asNumber(CUT_WASTE_HUNDREDTHS) : 0;
export const cleanCode = (value) => String(value ?? '').trim().toUpperCase();
export const NO_LOT_STOCK_CODE = '__NO_LOT__';
export function stockEntries(product) {
    return product?.tracksLots === false
        ? [{ code: NO_LOT_STOCK_CODE, physical: product.stock?.physical || '0', reserved: product.stock?.reserved || '0' }]
        : product?.lots || [];
}
export const lineKey = (line) => String(line?.id ?? '');
export const orderKey = (order) => [order?.canal, order?.serie, order?.numero].map(cleanCode).join('|');
const toCents = (value) => toHundredths(value) ?? 0;
const asNumber = (value) => fromHundredths(value);

export function pendingLines(order) {
    return (order?.lines || []).filter((line) => cleanCode(line.linservi) === 'P' && cleanCode(line.productCode) !== '' && toCents(line.quantity) > 0);
}

export function getLineProgress(order, line, picks = []) {
    const requested = toCents(line?.quantity);
    const prepared = picks.filter((pick) => String(pick.idLine) === lineKey(line))
        .reduce((sum, pick) => sum + toCents(pick.delivered), 0);
    return {
        requested: asNumber(requested),
        prepared: asNumber(prepared),
        remaining: asNumber(Math.max(0, requested - prepared)),
        finished: prepared >= requested,
    };
}

/**
 * Cantidad física restante del lote (simulada) después de cortes y decisiones
 * de sobrante. En CJM, un lote de tejido equivale a una pieza física.
 */
export function lotPhysicalRemainder(product, lot, picks = []) {
    if (!product || !lot) return 0;
    const allocations = picks.filter((pick) => cleanCode(pick.productCode) === cleanCode(product.code)
        && (product.tracksLots === false || cleanCode(pick.lotCode) === cleanCode(lot.code)));
    const decrease = allocations.reduce((sum, pick) => sum + toCents(pick.stockDeduction ??
        (toCents(pick.delivered) + toCents(pick.waste)) / 100)
        + toCents(pick.remainderDecision?.stockReduction), 0);
    return asNumber(Math.max(0, toCents(lot.physical) - decrease));
}

export function lotAvailable(product, lot, picks = []) {
    if (!product || !lot) return 0;
    return asNumber(Math.max(0, toCents(lotPhysicalRemainder(product, lot, picks)) - toCents(lot.reserved)));
}

/**
 * Muestra la decisión solo cuando hay un resto físico POSITIVO de 0,50 m o menos.
 * Si el lote ya queda a cero no hay una pieza para regularizar o trasladar.
 */
export function getCutRemainder({ product, lot, delivered, picks = [] }) {
    if (!product || !lot) return null;
    const cut = toHundredths(delivered);
    if (cut === null || cut <= 0) return null;
    const waste = product.unit === 'm' ? CUT_WASTE_HUNDREDTHS : 0;
    const after = toCents(lotPhysicalRemainder(product, lot, picks)) - cut - waste;
    return {
        physicalAfterCut: asNumber(Math.max(0, after)),
        reserved: asNumber(toCents(lot.reserved)),
        requiresDecision: product.tracksLots !== false && product.unit === 'm' && after > 0 && after <= SMALL_REMAINDER_HUNDREDTHS,
    };
}

/** Completa la decisión sobre el sobrante sin modificar stock real. */
export function decideRemainder({ pick, product, lot, action, picks = [] }) {
    if (!pick || !product || !lot) return { ok: false, errors: ['Primero revisa y valida el corte.'] };
    const remaining = getCutRemainder({ product, lot, delivered: pick.delivered, picks });
    if (!remaining?.requiresDecision) return { ok: false, errors: ['Este corte no requiere decidir sobre un resto pequeño.'] };
    if (!Object.values(REMAINDER_ACTIONS).includes(action)) return { ok: false, errors: ['Selecciona qué hacer con el resto del lote.'] };
    if (action !== REMAINDER_ACTIONS.KEEP && toCents(remaining.reserved) > 0) {
        return { ok: false, errors: ['Este lote tiene metros reservados. No puedes trasladar ni regularizar el resto sin resolver las reservas.'] };
    }
    const destination = REMAINDER_DESTINATIONS[action] || null;
    const stockReduction = action === REMAINDER_ACTIONS.KEEP ? 0 : remaining.physicalAfterCut;
    return {
        ok: true,
        pick: {
            ...pick,
            remainderDecision: {
                action,
                physicalAfterCut: remaining.physicalAfterCut,
                stockReduction,
                warehouseDestination: destination?.code || null,
                destinationName: destination?.name || null,
                // ZERO: pérdida/regularización. Traslado: baja de origen y alta de destino.
                movementKind: action === REMAINDER_ACTIONS.ZERO ? 'regularizacion'
                    : destination ? 'traslado_interno' : 'sin_movimiento',
            },
        },
    };
}

/** Scanner is keyboard-wedge + Enter; Stock+ labels encode plain product/lot strings. */
export function resolveScannedCode(raw, line, products) {
    const value = cleanCode(raw);
    if (!value) return { ok: false, message: 'Escanea el QR del producto o del lote.' };
    const product = products.find((item) => cleanCode(item.code) === cleanCode(line?.productCode));
    if (!product) return { ok: false, message: 'El producto del pedido no existe en el catálogo de prueba.' };
    if (value === cleanCode(product.code)) return { ok: true, kind: 'product', product };
    if (product.tracksLots === false) return { ok: false, message: 'Este producto se gestiona sin lotes: selecciona sus unidades directamente.' };
    const lot = stockEntries(product).find((item) => cleanCode(item.code) === value);
    if (lot) {
        const matches = products.filter((item) => item.tracksLots !== false
            && (item.lots || []).some((candidate) => cleanCode(candidate.code) === value));
        if (matches.length !== 1) return { ok: false, message: 'El lote está duplicado entre productos. No se puede identificar la pieza de forma segura.' };
        return { ok: true, kind: 'lot', lot, product };
    }
    const scannedOtherProduct = products.find((item) => cleanCode(item.code) === value);
    if (scannedOtherProduct) return { ok: false, message: 'Has escaneado otro producto. Comprueba la línea del pedido.' };
    const usedByOther = products.some((item) => cleanCode(item.code) !== cleanCode(product.code)
        && (item.lots || []).some((itemLot) => cleanCode(itemLot.code) === value));
    if (usedByOther) return { ok: false, message: 'Ese QR corresponde a un lote de otro producto. No se puede utilizar.' };
    return { ok: false, message: 'QR no reconocido para este producto. Prueba con el QR de lote de la etiqueta.' };
}

/** Returns a new pick, never mutating DB or sending requests. */
export function preparePick({ order, line, product, lot, delivered, picks = [] }) {
    const errors = [];
    const actualLine = pendingLines(order).find((item) => lineKey(item) === lineKey(line));
    if (!actualLine) errors.push('Selecciona una línea pendiente del pedido.');
    if (!product || cleanCode(product.code) !== cleanCode(actualLine?.productCode)) errors.push('El producto no coincide con el pedido.');
    // Usar SIEMPRE el lote del catálogo, nunca existencias recibidas en un objeto externo.
    const actualLot = stockEntries(product).find((item) => lot && cleanCode(item.code) === cleanCode(lot.code));
    if (!actualLot) errors.push('El lote no pertenece al producto seleccionado.');
    if (product?.tracksLots !== false && actualLot && stockEntries(product).filter((candidate) => cleanCode(candidate.code) === cleanCode(actualLot.code)).length !== 1) {
        errors.push('El código del lote está duplicado para este producto.');
    }
    const deliveredCents = toHundredths(delivered);
    const wasteCents = product?.unit === 'm' ? CUT_WASTE_HUNDREDTHS : 0;
    if (deliveredCents === null || deliveredCents <= 0) errors.push('Introduce la cantidad cortada para el cliente (mayor que cero).');
    if (product?.unit !== 'm' && deliveredCents !== null && deliveredCents % 100 !== 0) errors.push('Las unidades no admiten decimales.');
    const remaining = toCents(getLineProgress(order, actualLine, picks).remaining);
    if (deliveredCents !== null && deliveredCents > remaining) errors.push('No puedes preparar más metros de los pendientes de esta línea.');
    const available = toCents(lotAvailable(product, actualLot, picks));
    const physical = toHundredths(actualLot?.physical);
    const reserved = toHundredths(actualLot?.reserved);
    if (actualLot && (physical === null || reserved === null || reserved > physical)) {
        errors.push('El stock o las reservas del lote no son válidos. No se puede preparar el corte.');
    }
    if (deliveredCents !== null && !Number.isSafeInteger(deliveredCents + wasteCents)) errors.push('La cantidad supera el límite numérico permitido.');
    if (deliveredCents !== null && deliveredCents + wasteCents > available) errors.push('El lote no tiene cantidad suficiente para el cliente más la merma automática de 0,10 m por corte.');
    if (errors.length) return { ok: false, errors };
    const nextSequence = picks.filter((pick) => String(pick.idLine) === lineKey(actualLine))
        .reduce((maximum, pick) => Math.max(maximum, Number(String(pick.id).split('-').at(-1)) || 0), 0) + 1;
    const remainder = getCutRemainder({ product, lot: actualLot, delivered, picks });
    return {
        ok: true,
        requiresRemainderDecision: remainder.requiresDecision,
        remainder,
        pick: {
            id: `${lineKey(actualLine)}-${nextSequence}`,
            idLine: lineKey(actualLine),
            productCode: product.code,
            lotCode: product.tracksLots === false ? null : actualLot.code,
            delivered: asNumber(deliveredCents),
            waste: asNumber(wasteCents),
            stockDeduction: asNumber(deliveredCents + wasteCents),
            unit: product.unit || 'm',
        },
    };
}

export function getOrderProgress(order, picks = [], products = []) {
    const lines = pendingLines(order).map((line) => {
        const progress = getLineProgress(order, line, picks);
        const product = products.find((item) => cleanCode(item.code) === cleanCode(line.productCode));
        const entries = stockEntries(product);
        const stockError = !product || !entries.length || entries.some((lot) => {
            const physical = toHundredths(lot.physical);
            const reserved = toHundredths(lot.reserved);
            return physical === null || reserved === null || reserved > physical;
        });
        const available = stockError ? null : asNumber(entries.reduce((sum, lot) => sum
            + Math.max(0, toCents(lotAvailable(product, lot, picks)) - (product.unit === 'm' ? CUT_WASTE_HUNDREDTHS : 0)), 0));
        return { ...line, ...progress, available, stockError, outOfStock: !stockError && progress.remaining > 0 && available === 0 };
    });
    // Los agregados simples solo deben usarse en operaciones de una misma unidad.
    const delivered = picks.reduce((sum, pick) => sum + toCents(pick.delivered), 0);
    const waste = picks.reduce((sum, pick) => sum + toCents(pick.waste), 0);
    const totalsByUnit = {};
    for (const pick of picks) {
        const unit = pick.unit || 'm';
        const totals = totalsByUnit[unit] || { delivered: 0, waste: 0, deduction: 0, regularized: 0, transferred: 0, sourceReduction: 0 };
        totals.delivered += toCents(pick.delivered);
        totals.waste += toCents(pick.waste);
        totals.deduction += toCents(pick.stockDeduction);
        const decision = pick.remainderDecision;
        if (decision?.movementKind === 'regularizacion') totals.regularized += toCents(decision.stockReduction);
        if (decision?.movementKind === 'traslado_interno') totals.transferred += toCents(decision.stockReduction);
        totals.sourceReduction += toCents(pick.stockDeduction) + toCents(decision?.stockReduction);
        totalsByUnit[unit] = totals;
    }
    Object.values(totalsByUnit).forEach((unitTotals) => {
        unitTotals.delivered = asNumber(unitTotals.delivered);
        unitTotals.waste = asNumber(unitTotals.waste);
        unitTotals.deduction = asNumber(unitTotals.deduction);
        unitTotals.regularized = asNumber(unitTotals.regularized);
        unitTotals.transferred = asNumber(unitTotals.transferred);
        unitTotals.sourceReduction = asNumber(unitTotals.sourceReduction);
    });
    return {
        lines, totalsByUnit,
        total: lines.length,
        completed: lines.filter((line) => line.finished).length,
        pending: lines.filter((line) => !line.finished).length,
        zeroStock: lines.filter((line) => line.outOfStock),
        percent: lines.length ? Math.round((lines.filter((line) => line.finished).length / lines.length) * 100) : 100,
        delivered: asNumber(delivered),
        waste: asNumber(waste),
        deduction: asNumber(delivered + waste),
    };
}

export function formatUnitTotals(totals, field = 'delivered') {
    const units = Object.entries(totals || {});
    return units.length ? units.map(([unit, values]) => `${asNumber(toCents(values[field])).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${unit}`).join(' + ') : '0 m';
}

/** Revisión defensiva: reproducir TODAS las preparaciones evita documentos con
 *  cortes editados, repetidos, stock negativo o merma manipulada. */
export function validatePreparedPicks(order, picks = [], products = []) {
    const errors = [];
    const seenIds = new Set();
    const byLine = new Map();
    const byStock = new Map();
    const validLines = pendingLines(order);
    const expectedLines = new Map(validLines.map((line) => [lineKey(line), line]));
    if (expectedLines.size !== validLines.length) errors.push('El pedido contiene líneas con identificadores repetidos.');

    for (const pick of picks) {
        if (!pick || typeof pick !== 'object') { errors.push('Hay un corte sin datos válidos.'); continue; }
        const id = String(pick.id ?? '');
        if (!id || seenIds.has(id)) errors.push('Hay cortes con identificadores repetidos o vacíos.');
        seenIds.add(id);
        const line = expectedLines.get(String(pick.idLine ?? ''));
        if (!line) { errors.push('Hay un corte que no pertenece a una línea pendiente del pedido.'); continue; }
        const product = products.find((item) => cleanCode(item.code) === cleanCode(line.productCode));
        if (!product || cleanCode(pick.productCode) !== cleanCode(line.productCode)) {
            errors.push(`El producto preparado no coincide con ${line.productCode}.`); continue;
        }
        const lot = stockEntries(product).find((item) => product.tracksLots === false
            ? pick.lotCode == null : cleanCode(item.code) === cleanCode(pick.lotCode));
        if (product.tracksLots !== false && products.filter((item) => item.tracksLots !== false
            && (item.lots || []).some((candidate) => cleanCode(candidate.code) === cleanCode(pick.lotCode))).length !== 1) {
            errors.push(`El lote ${pick.lotCode} no es único entre los productos del catálogo.`);
        }
        if (!lot) { errors.push(`El lote de ${line.productCode} no existe o corresponde a otro producto.`); continue; }
        const delivered = toHundredths(pick.delivered);
        const waste = toHundredths(pick.waste);
        const deduction = toHundredths(pick.stockDeduction);
        const expectedWaste = product.unit === 'm' ? CUT_WASTE_HUNDREDTHS : 0;
        if (delivered === null || delivered <= 0 || (product.unit !== 'm' && delivered % 100 !== 0)
            || waste !== expectedWaste || deduction !== delivered + expectedWaste || !Number.isSafeInteger(deduction)) {
            errors.push(`Las cantidades o la merma de ${line.productCode} no son coherentes.`); continue;
        }
        const lineId = lineKey(line);
        const deliveredLine = (byLine.get(lineId) || 0) + delivered;
        byLine.set(lineId, deliveredLine);
        if (!Number.isSafeInteger(deliveredLine) || deliveredLine > toHundredths(line.quantity)) errors.push(`Se ha preparado más de lo pedido en ${line.productCode}.`);

        const stockKey = [cleanCode(product.code), product.tracksLots === false ? NO_LOT_STOCK_CODE : cleanCode(lot.code)].join('|');
        const physical = toHundredths(lot.physical);
        const reserved = toHundredths(lot.reserved);
        if (physical === null || reserved === null || reserved > physical) {
            errors.push(`El stock del lote ${lot.code} no es válido.`); continue;
        }
        const previousConsumption = byStock.get(stockKey) || 0;
        const physicalAfterCut = physical - previousConsumption - deduction;
        if (physicalAfterCut < reserved) errors.push(`El lote ${lot.code} quedaría por debajo de sus reservas.`);
        let additional = 0;
        if (pick.remainderDecision) {
            const decision = pick.remainderDecision;
            const action = decision.action;
            const requiresDecision = product.tracksLots !== false && product.unit === 'm'
                && physicalAfterCut > 0 && physicalAfterCut <= SMALL_REMAINDER_HUNDREDTHS;
            if (!requiresDecision || !Object.values(REMAINDER_ACTIONS).includes(action)) {
                errors.push(`La decisión sobre el resto del lote ${lot.code} no es válida.`);
            } else {
                const expectedReduction = action === REMAINDER_ACTIONS.KEEP ? 0 : physicalAfterCut;
                const destination = REMAINDER_DESTINATIONS[action] || null;
                const expectedKind = action === REMAINDER_ACTIONS.ZERO ? 'regularizacion'
                    : destination ? 'traslado_interno' : 'sin_movimiento';
                if (toHundredths(decision.physicalAfterCut) !== physicalAfterCut
                    || toHundredths(decision.stockReduction) !== expectedReduction
                    || (decision.warehouseDestination || null) !== (destination?.code || null)
                    || decision.movementKind !== expectedKind
                    || (action !== REMAINDER_ACTIONS.KEEP && reserved > 0)) {
                    errors.push(`El tratamiento del resto del lote ${lot.code} no coincide con el stock.`);
                }
                additional = expectedReduction;
            }
        } else if (product.tracksLots !== false && product.unit === 'm'
            && physicalAfterCut > 0 && physicalAfterCut <= SMALL_REMAINDER_HUNDREDTHS) {
            errors.push(`Falta decidir qué hacer con el resto del lote ${lot.code}.`);
        }
        const totalConsumption = previousConsumption + deduction + additional;
        if (!Number.isSafeInteger(totalConsumption) || totalConsumption > physical - reserved) {
            errors.push(`El lote ${lot.code} no tiene stock suficiente para los cortes y sus restos.`);
        }
        byStock.set(stockKey, totalConsumption);
    }
    return [...new Set(errors)];
}

export function validateOrderReview(order, picks, products, acknowledgedPending = []) {
    const progress = getOrderProgress(order, picks, products);
    const errors = validatePreparedPicks(order, picks, products);
    if (!order || !progress.total) errors.push('Selecciona un pedido que tenga líneas pendientes.');
    if (progress.lines.some((line) => line.stockError)) errors.push('El catálogo contiene artículos sin stock verificable. Comprueba las existencias antes de generar documentos.');
    if (progress.lines.some((line) => line.remaining > 0 && !acknowledgedPending.includes(lineKey(line)))) {
        errors.push('Marca expresamente qué productos quedarán pendientes antes de finalizar.');
    }
    return { ok: !errors.length, errors, progress };
}
