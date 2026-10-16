import { cleanCode, formatUnitTotals, getOrderProgress, pendingLines } from './sgaPicking.js';
import { qtyText } from './sgaRules.js';
const metric = (value, unit = 'm') => `${qtyText(value)} ${unit}`;

/** A preparation sheet, NOT an official ERP delivery note. */
export function buildOrderDraft(order, picks, products, pendingAcknowledged, kind = 'interno') {
    const forClient = kind === 'entrega';
    const progress = getOrderProgress(order, picks, products);
    const lines = pendingLines(order).map((line) => {
        const progressLine = progress.lines.find((row) => row.id === line.id);
        const product = products.find((item) => cleanCode(item.code) === cleanCode(line.productCode));
        const picksOfLine = picks.filter((pick) => pick.idLine === String(line.id));
        const unit = product?.unit || 'm';
        const delivered = picksOfLine.reduce((sum, item) => sum + Math.round(item.delivered * 100), 0) / 100;
        return {
            productCode: line.productCode,
            description: line.description || product?.description || line.productCode,
            unit,
            requested: metric(line.quantity, unit),
            delivered: metric(delivered, unit),
            remaining: metric(progressLine.remaining, unit),
            status: progressLine.finished ? 'Preparado' : pendingAcknowledged.includes(String(line.id)) ? 'Pendiente confirmado' : 'Pendiente',
            // No stock data, merma, warehouse, roll or internal notes in client sheet.
            ...(forClient ? {} : {
                cuts: picksOfLine.map((item) => ({ lotCode: item.lotCode, delivered: metric(item.delivered, unit), waste: metric(item.waste, unit), stockDeduction: metric(item.stockDeduction, unit) })),
                waste: metric(picksOfLine.reduce((sum, item) => sum + Math.round(item.waste * 100), 0) / 100, unit),
            }),
        };
    });
    const out = {
        kind, forClient, orderNumber: order.numero, clientCode: order.clientCode,
        clientName: order.clientName, state: progress.pending === 0 ? 'PREPARACIÓN COMPLETA' : 'PREPARACIÓN PARCIAL',
        lines, totalDelivered: formatUnitTotals(progress.totalsByUnit, 'delivered'),
        pendingLines: progress.pending,
    };
    if (!forClient) { out.totalWaste = formatUnitTotals(progress.totalsByUnit, 'waste'); out.totalStockDeduction = formatUnitTotals(progress.totalsByUnit, 'deduction'); }
    return out;
}
