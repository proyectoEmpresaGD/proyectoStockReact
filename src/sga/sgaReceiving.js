/** SGA · Recepción guiada desde pedido de compra. Todas las operaciones son simuladas.
 * Un lote = una pieza física para los tejidos. No existe entidad «rollo» independiente.
 */
import { fromHundredths, toHundredths } from './sgaRules.js';

export const LOT_MODE = Object.freeze({ GENERATED: 'generated', MANUAL: 'manual' });
export const cleanLotCode = (value) => String(value ?? '').trim().toUpperCase();
const cents = (value) => toHundredths(value) ?? 0;

export function usesLots(product) {
    return product?.tracksLots !== false;
}

/** quantity corresponde a la cantidad AÚN pendiente de recibir desde ERP. */
export function pendingPurchaseLines(order) {
    return (order?.lines || []).filter((line) => cleanLotCode(line.status) === 'P'
        && cleanLotCode(line.productCode) && cents(line.quantity) > 0);
}

export function lineReceiptProgress(line, receipts = []) {
    const required = cents(line?.quantity);
    const received = receipts.filter((receipt) => String(receipt.lineId) === String(line?.id))
        .reduce((total, receipt) => total + cents(receipt.quantity), 0);
    return {
        required: fromHundredths(required),
        received: fromHundredths(received),
        remaining: fromHundredths(Math.max(0, required - received)),
        completed: received >= required,
    };
}

export function purchaseReceiptProgress(order, receipts = [], products = []) {
    const lines = pendingPurchaseLines(order).map((line) => ({
        ...line,
        ...lineReceiptProgress(line, receipts),
        unit: products.find((p) => cleanLotCode(p.code) === cleanLotCode(line.productCode))?.unit || 'm',
    }));
    return {
        lines,
        completed: lines.filter((line) => line.completed).length,
        total: lines.length,
        pending: lines.filter((line) => !line.completed).length,
        pieces: receipts.filter((receipt) => receipt.lotCode).length,
    };
}

export function usedLotCodes(products = [], receipts = []) {
    return new Set([
        ...products.flatMap((product) => (product.lots || []).map((lot) => cleanLotCode(lot.code))),
        ...receipts.filter((receipt) => receipt.lotCode).map((receipt) => cleanLotCode(receipt.lotCode)),
    ].filter(Boolean));
}

/** Generación solo de DEMOSTRACIÓN: la numeración real debe ser transaccional en backend. */
export function nextDemoLotCode(products = [], receipts = []) {
    const used = usedLotCodes(products, receipts);
    for (let number = 1; number <= 999999; number += 1) {
        const code = `DEMO-LT-${String(number).padStart(6, '0')}`;
        if (!used.has(code)) return code;
    }
    throw new Error('No quedan códigos disponibles para la demostración.');
}

export function validateReceipt({ order, line, product, warehouse, location, quantity, lotCode, mode, equivalence, equivalences = [], receipts = [], products = [], unavailableLotCodes = [] }) {
    const errors = [];
    const actualLine = pendingPurchaseLines(order).find((candidate) => String(candidate.id) === String(line?.id));
    if (!actualLine) errors.push('Selecciona una línea pendiente del pedido de compra.');
    if (!product || cleanLotCode(product.code) !== cleanLotCode(actualLine?.productCode)) {
        errors.push('El artículo no coincide con la línea de compra.');
    }
    const catalogProduct = products.find((item) => cleanLotCode(item.code) === cleanLotCode(actualLine?.productCode));
    if (!catalogProduct || !product || product.unit !== catalogProduct.unit
        || product.tracksLots !== catalogProduct.tracksLots) {
        errors.push('Los datos de identificación o unidad del artículo no coinciden con el catálogo.');
    }
    if (!warehouse) errors.push('Selecciona el almacén de destino.');
    if (!location) errors.push('Selecciona la ubicación de destino.');
    const quantityCents = toHundredths(quantity);
    if (quantityCents === null || quantityCents <= 0) errors.push('Introduce una cantidad mayor que cero (máximo dos decimales).');
    if (product?.unit !== 'm' && quantityCents !== null && quantityCents % 100 !== 0) {
        errors.push('Este artículo se contabiliza por unidades enteras.');
    }
    if (quantityCents !== null && actualLine && quantityCents > cents(lineReceiptProgress(actualLine, receipts).remaining)) {
        errors.push('La cantidad supera los metros o unidades pendientes de recibir en esta línea.');
    }
    if (usesLots(product)) {
        if (![LOT_MODE.GENERATED, LOT_MODE.MANUAL].includes(mode)) {
            errors.push('Identifica esta pieza y genera o introduce su lote individualmente.');
        }
        // Los proveedores no identifican nuestras piezas. Cada pieza requiere
        // una selección explícita de la equivalencia CJM desde el catálogo.
        const foundEquivalence = equivalences.find((item) => cleanLotCode(item.codequiv) === cleanLotCode(equivalence?.codequiv)
            && cleanLotCode(item.codprodu) === cleanLotCode(product?.code));
        if (!foundEquivalence || !cleanLotCode(equivalence?.codequiv)) {
            errors.push('Selecciona y confirma la equivalencia CJM correspondiente a esta pieza.');
        }
        if (!cleanLotCode(lotCode)) errors.push('Cada pieza de tejido debe tener un lote propio.');
        if (cleanLotCode(lotCode) && !/^[A-Z0-9][A-Z0-9._\-/]{0,39}$/.test(cleanLotCode(lotCode))) {
            errors.push('El código del lote solo puede incluir letras, números, guiones, puntos, barras y guiones bajos (máximo 40 caracteres).');
        }
        if (cleanLotCode(lotCode) && (usedLotCodes(products, receipts).has(cleanLotCode(lotCode))
            || unavailableLotCodes.some((code) => cleanLotCode(code) === cleanLotCode(lotCode)))) {
            errors.push('Este lote ya existe, fue etiquetado antes o está añadido en la recepción. Cada pieza requiere uno diferente.');
        }
    } else if (cleanLotCode(lotCode)) {
        errors.push('Este artículo no se gestiona por lotes: no indiques un lote.');
    }
    return [...new Set(errors)];
}

export function addReceipt({ order, line, product, warehouse, location, quantity, lotCode, mode, equivalence = null, equivalences = [], receipts = [], products = [], unavailableLotCodes = [] }) {
    const errors = validateReceipt({ order, line, product, warehouse, location, quantity, lotCode, mode, equivalence, equivalences, receipts, products, unavailableLotCodes });
    if (errors.length) return { ok: false, errors };
    // Utilizamos la definición canónica del pedido y del catálogo para el movimiento.
    const actualLine = pendingPurchaseLines(order).find((candidate) => String(candidate.id) === String(line.id));
    const actualProduct = products.find((item) => cleanLotCode(item.code) === cleanLotCode(actualLine.productCode));
    const serial = receipts.reduce((maximum, receipt) => Math.max(maximum, Number(receipt.seq) || 0), 0) + 1;
    const knownEquivalence = equivalences.find((item) => cleanLotCode(item.codequiv) === cleanLotCode(equivalence?.codequiv)
        && cleanLotCode(item.codprodu) === cleanLotCode(actualProduct.code));
    const receipt = {
        id: `${order.id}:${line.id}:${serial}`,
        seq: serial,
        orderId: order.id,
        orderNumber: order.number,
        lineId: actualLine.id,
        productCode: actualProduct.code,
        description: actualLine.description || actualProduct.description,
        quantity: fromHundredths(toHundredths(quantity)),
        unit: actualProduct.unit,
        lotCode: usesLots(actualProduct) ? cleanLotCode(lotCode) : null,
        lotMode: usesLots(actualProduct) ? mode : null,
        equivalenceCode: usesLots(actualProduct) ? cleanLotCode(knownEquivalence.codequiv) : null,
        equivalenceDescription: usesLots(actualProduct) ? String(knownEquivalence.desequiv || '').trim() : null,
        supplierCode: usesLots(actualProduct) ? String(knownEquivalence.codprove || '').trim() : null,
        warehouse,
        location,
        simulated: true,
    };
    // Un artículo sin lotes constituye una sola existencia por artículo y ubicación.
    // Las recepciones repetidas en la misma ubicación se acumulan en una única fila.
    if (!usesLots(actualProduct)) {
        const existing = receipts.find((item) => String(item.lineId) === String(actualLine.id) && item.lotCode === null
            && item.warehouse === warehouse && item.location === location);
        if (existing) {
            const newTotal = cents(existing.quantity) + cents(receipt.quantity);
            if (!Number.isSafeInteger(newTotal)) return { ok: false, errors: ['La cantidad acumulada supera el límite numérico permitido.'] };
            const combined = fromHundredths(newTotal);
            const updated = { ...existing, quantity: combined };
            return { ok: true, receipt: updated,
                receipts: receipts.map((item) => item.id === existing.id ? updated : item) };
        }
    }
    return { ok: true, receipt, receipts: [...receipts, receipt] };
}

export function validateReceiptReview(order, receipts = [], products = [], acknowledgedPending = []) {
    const progress = purchaseReceiptProgress(order, receipts, products);
    const errors = [];
    if (!progress.total) errors.push('Selecciona un pedido con líneas pendientes de recibir.');
    if (!receipts.length) errors.push('Registra al menos una pieza o artículo para preparar el documento.');

    const linesById = new Map(pendingPurchaseLines(order).map((line) => [String(line.id), line]));
    if (linesById.size !== pendingPurchaseLines(order).length) errors.push('El pedido de compra tiene identificadores de línea duplicados.');
    const receivedByLine = new Map();
    const lotsSeen = new Set();
    const receiptIds = new Set();
    const existingLots = usedLotCodes(products);
    for (const receipt of receipts) {
        if (!receipt || typeof receipt !== 'object') { errors.push('Hay una recepción sin datos válidos.'); continue; }
        const id = String(receipt.id ?? '');
        if (!id || receiptIds.has(id)) errors.push('Existen recepciones con identificadores repetidos o vacíos.');
        receiptIds.add(id);
        if (String(receipt.orderId) !== String(order?.id)) errors.push('Una entrada no pertenece al pedido de compra seleccionado.');
        const line = linesById.get(String(receipt.lineId));
        if (!line || cleanLotCode(receipt.productCode) !== cleanLotCode(line.productCode)) {
            errors.push('Hay una pieza recibida que no corresponde a la línea de compra.'); continue;
        }
        const product = products.find((item) => cleanLotCode(item.code) === cleanLotCode(line.productCode));
        if (!product || receipt.unit !== product.unit) { errors.push('La unidad de una entrada no coincide con el producto.'); continue; }
        const quantity = toHundredths(receipt.quantity);
        if (quantity === null || quantity <= 0 || (product.unit !== 'm' && quantity % 100 !== 0)) {
            errors.push(`Cantidad de entrada inválida para ${receipt.productCode}.`); continue;
        }
        if (!String(receipt.warehouse || '').trim() || !String(receipt.location || '').trim()) {
            errors.push(`Falta el almacén o la ubicación de ${receipt.productCode}.`);
        }
        const lineId = String(receipt.lineId);
        const cumulative = (receivedByLine.get(lineId) || 0) + quantity;
        receivedByLine.set(lineId, cumulative);
        if (!Number.isSafeInteger(cumulative) || cumulative > toHundredths(line.quantity)) {
            errors.push(`La entrada de ${receipt.productCode} supera la cantidad pendiente del pedido.`);
        }
        if (usesLots(product)) {
            const code = cleanLotCode(receipt.lotCode);
            if (!code || !/^[A-Z0-9][A-Z0-9._\-/]{0,39}$/.test(code)) {
                errors.push(`Lote inválido o inexistente para ${receipt.productCode}.`);
            } else if (lotsSeen.has(code) || existingLots.has(code)) {
                errors.push(`Lote duplicado: ${code}.`);
            }
            lotsSeen.add(code);
            if (!cleanLotCode(receipt.equivalenceCode)) errors.push(`La pieza ${code || receipt.productCode} no tiene una equivalencia confirmada.`);
        } else if (receipt.lotCode || receipt.equivalenceCode) {
            errors.push(`El artículo ${receipt.productCode} no utiliza lotes ni equivalencias por pieza.`);
        }
    }

    for (const line of progress.lines) {
        if (line.remaining > 0 && !acknowledgedPending.map(String).includes(String(line.id))) {
            errors.push(`Confirma que quedarán pendientes ${line.remaining} ${line.unit} de ${line.description}.`);
        }
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)], progress };
}

/** Estructura para conectar posteriormente con documentos de entrada reales, sin grabar. */
export function receiptDocumentData({ order, receipts, products, operator, acknowledgedPending = [] }) {
    const verification = validateReceiptReview(order, receipts, products, acknowledgedPending);
    if (!verification.ok) throw new Error(verification.errors.join(' '));
    return {
        title: 'Parte de recepción de mercancía',
        orderNumber: order.number,
        supplier: order.supplier,
        operator,
        lines: receipts.map((receipt) => ({
            productCode: receipt.productCode,
            description: receipt.description,
            lotCode: receipt.lotCode,
            equivalenceCode: receipt.equivalenceCode,
            equivalenceDescription: receipt.equivalenceDescription,
            quantity: receipt.quantity,
            unit: receipt.unit,
            warehouse: receipt.warehouse,
            location: receipt.location,
        })),
        pending: verification.progress.lines.filter((line) => line.remaining > 0).map((line) => ({
            productCode: line.productCode,
            quantity: line.remaining,
            unit: line.unit,
        })),
        simulated: true,
    };
}
