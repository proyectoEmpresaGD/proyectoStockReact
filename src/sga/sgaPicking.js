/**
 * SGA · Preparación de pedidos, exclusivamente en memoria en esta fase.
 * Las cantidades usan centésimas enteras (metros con dos decimales).
 * Un pick de 4,50 m + 0,20 m de merma consume 4,70 m de stock,
 * pero SOLO 4,50 m corresponden al cliente / documento.
 */
import { toHundredths, fromHundredths } from './sgaRules.js';

export const cleanCode = (value) => String(value ?? '').trim().toUpperCase();
export const lineKey = (line) => String(line?.id ?? '');
export const orderKey = (order) => [order?.canal, order?.serie, order?.numero].map(cleanCode).join('|');
const toCents = (value) => toHundredths(value) ?? 0;
const asNumber = (value) => fromHundredths(value);

export function pendingLines(order) {
    return (order?.lines || []).filter((line) => cleanCode(line.linservi) === 'P' && toCents(line.quantity) > 0);
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

export function lotAvailable(product, lot, picks = []) {
    if (!product || !lot) return 0;
    const physical = toCents(lot.physical);
    const reserved = toCents(lot.reserved);
    const allocated = picks.filter((pick) => cleanCode(pick.productCode) === cleanCode(product.code)
        && cleanCode(pick.lotCode) === cleanCode(lot.code))
        .reduce((sum, pick) => sum + toCents(pick.delivered) + toCents(pick.waste), 0);
    return asNumber(Math.max(0, physical - reserved - allocated));
}

/** Scanner is keyboard-wedge + Enter; Stock+ labels encode plain product/lot strings. */
export function resolveScannedCode(raw, line, products) {
    const value = cleanCode(raw);
    if (!value) return { ok: false, message: 'Escanea el QR del producto o del lote.' };
    const product = products.find((item) => cleanCode(item.code) === cleanCode(line?.productCode));
    if (!product) return { ok: false, message: 'El producto del pedido no existe en el catálogo de prueba.' };
    if (value === cleanCode(product.code)) return { ok: true, kind: 'product', product };
    const lot = (product.lots || []).find((item) => cleanCode(item.code) === value);
    if (lot) return { ok: true, kind: 'lot', lot, product };
    const scannedOtherProduct = products.find((item) => cleanCode(item.code) === value);
    if (scannedOtherProduct) return { ok: false, message: 'Has escaneado otro producto. Comprueba la línea del pedido.' };
    const usedByOther = products.some((item) => cleanCode(item.code) !== cleanCode(product.code)
        && (item.lots || []).some((itemLot) => cleanCode(itemLot.code) === value));
    if (usedByOther) return { ok: false, message: 'Ese QR corresponde a un lote de otro producto. No se puede utilizar.' };
    return { ok: false, message: 'QR no reconocido para este producto. Prueba con el QR de lote de la etiqueta.' };
}

/** Returns a new pick, never mutating DB or sending requests. */
export function preparePick({ order, line, product, lot, delivered, waste = '0', picks = [] }) {
    const errors = [];
    if (!order || !pendingLines(order).some((item) => lineKey(item) === lineKey(line))) errors.push('Selecciona una línea pendiente del pedido.');
    if (cleanCode(product?.code) !== cleanCode(line?.productCode)) errors.push('El producto no coincide con el pedido.');
    if (!product?.lots?.some((item) => cleanCode(item.code) === cleanCode(lot?.code))) errors.push('El lote no pertenece al producto seleccionado.');
    const deliveredCents = toHundredths(delivered);
    const wasteCents = toHundredths(waste === '' ? '0' : waste);
    if (deliveredCents === null || deliveredCents <= 0) errors.push('Introduce la cantidad cortada para el cliente (mayor que cero).');
    if (wasteCents === null) errors.push('Indica una merma válida; utiliza 0 si no existe.');
    if (product?.unit !== 'm' && wasteCents > 0) errors.push('La merma de corte solo se aplica a tejidos.');
    if (product?.unit !== 'm' && deliveredCents !== null && deliveredCents % 100 !== 0) errors.push('Las unidades no admiten decimales.');
    const remaining = toCents(getLineProgress(order, line, picks).remaining);
    if (deliveredCents !== null && deliveredCents > remaining) errors.push('No puedes preparar más metros de los pendientes de esta línea.');
    const available = toCents(lotAvailable(product, lot, picks));
    if (deliveredCents !== null && wasteCents !== null && deliveredCents + wasteCents > available) errors.push('El lote no tiene metros disponibles para el corte y la merma.');
    if (errors.length) return { ok: false, errors };
    const nextSequence = picks.filter((pick) => String(pick.idLine) === lineKey(line))
        .reduce((maximum, pick) => Math.max(maximum, Number(String(pick.id).split('-').at(-1)) || 0), 0) + 1;
    return {
        ok: true,
        pick: {
            id: `${lineKey(line)}-${nextSequence}`,
            idLine: lineKey(line),
            productCode: product.code,
            lotCode: lot.code,
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
        const available = product ? asNumber((product.lots || []).reduce((sum, lot) => sum + toCents(lotAvailable(product, lot, picks)), 0)) : 0;
        return { ...line, ...progress, available, outOfStock: progress.remaining > 0 && available === 0 };
    });
    // Los agregados simples solo deben usarse en operaciones de una misma unidad.
    const delivered = picks.reduce((sum, pick) => sum + toCents(pick.delivered), 0);
    const waste = picks.reduce((sum, pick) => sum + toCents(pick.waste), 0);
    const totalsByUnit = {};
    for (const pick of picks) {
        const unit = pick.unit || 'm';
        const totals = totalsByUnit[unit] || { delivered: 0, waste: 0, deduction: 0 };
        totals.delivered += toCents(pick.delivered);
        totals.waste += toCents(pick.waste);
        totals.deduction += toCents(pick.delivered) + toCents(pick.waste);
        totalsByUnit[unit] = totals;
    }
    Object.values(totalsByUnit).forEach((unitTotals) => {
        unitTotals.delivered = asNumber(unitTotals.delivered);
        unitTotals.waste = asNumber(unitTotals.waste);
        unitTotals.deduction = asNumber(unitTotals.deduction);
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

export function validateOrderReview(order, picks, products, acknowledgedPending = []) {
    const progress = getOrderProgress(order, picks, products);
    const errors = [];
    if (!order || !progress.total) errors.push('Selecciona un pedido que tenga líneas pendientes.');
    if (progress.lines.some((line) => line.remaining > 0 && !acknowledgedPending.includes(lineKey(line)))) {
        errors.push('Marca expresamente qué productos quedarán pendientes antes de finalizar.');
    }
    return { ok: !errors.length, errors, progress };
}
