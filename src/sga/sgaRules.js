/**
 * Reglas puras de movimientos SGA, sin acceso a base de datos.
 * Todas las cantidades se convierten a centésimas para evitar errores binarios.
 * Los metros facturables NUNCA incluyen la merma.
 */
export const MOVEMENT_TYPES = Object.freeze({ ENTRY: 'entrada', EXIT: 'salida', ADJUST: 'regularizacion' });

export function toHundredths(value) {
    const input = String(value ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
    const [whole, decimals = ''] = input.split('.');
    const amount = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
    return Number.isSafeInteger(amount) ? amount : null;
}

export const fromHundredths = (value) => Number((value / 100).toFixed(2));
export const qtyText = (value) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);

export function buildSgaPreview({ type, product, lot, warehouse, location, quantity, waste, counted, reason, reference, note, rollCode }) {
    const errors = [];
    if (!Object.values(MOVEMENT_TYPES).includes(type)) errors.push('Selecciona una operación.');
    if (!product?.code) errors.push('Selecciona un producto.');
    if (!warehouse) errors.push('Indica el almacén.');
    if (!lot?.code) errors.push('Selecciona o indica un lote.');
    if (type === MOVEMENT_TYPES.ADJUST && !String(reason || '').trim()) errors.push('Selecciona un motivo de regularización.');

    const isFabric = product?.unit === 'm';
    const unit = isFabric ? 'm' : 'ud';
    const current = toHundredths(lot?.physical ?? '0') ?? 0;
    const reserved = toHundredths(lot?.reserved ?? '0') ?? 0;
    const available = Math.max(0, current - reserved);
    const amount = toHundredths(quantity);
    const wasteQty = isFabric ? toHundredths(waste === '' ? '0' : waste) : 0;
    const countedQty = toHundredths(counted);
    if (!isFabric && (
        (type === MOVEMENT_TYPES.ENTRY && amount !== null && amount % 100 !== 0)
        || (type === MOVEMENT_TYPES.EXIT && amount !== null && amount % 100 !== 0)
        || (type === MOVEMENT_TYPES.ADJUST && countedQty !== null && countedQty % 100 !== 0)
    )) errors.push('Los productos por unidades solo admiten cantidades enteras.');
    let delta = 0;
    let billed = 0;
    let loss = 0;

    if (type === MOVEMENT_TYPES.ENTRY) {
        if (amount === null || amount <= 0) errors.push('Indica una cantidad de entrada mayor que cero, con un máximo de dos decimales.');
        if (amount !== null) delta = amount;
    }
    if (type === MOVEMENT_TYPES.EXIT) {
        if (amount === null || amount <= 0) errors.push('Indica la cantidad que recibirá el cliente.');
        if (wasteQty === null || wasteQty < 0) errors.push('La merma debe ser una cantidad válida.');
        if (!isFabric && String(waste || '').trim() && (toHundredths(waste) || 0) > 0) errors.push('La merma de corte solo se admite para tejidos.');
        billed = amount ?? 0;
        loss = wasteQty ?? 0;
        delta = -(billed + loss);
        if (billed + loss > available) errors.push('No hay stock disponible suficiente en el lote para entrega y merma.');
        if (!String(reference || '').trim()) errors.push('Introduce una referencia de pedido o salida.');
    }
    if (type === MOVEMENT_TYPES.ADJUST) {
        if (countedQty === null) errors.push('Indica el stock físico contado.');
        if (countedQty !== null) delta = countedQty - current;
        if (countedQty !== null && countedQty < reserved) errors.push('El recuento no puede ser inferior al stock reservado sin resolver primero las reservas.');
        if (countedQty !== null && delta === 0) errors.push('El recuento coincide con el stock actual: no hay diferencia que regularizar.');
    }

    const projected = current + delta;
    if (projected < 0) errors.push('La operación no puede dejar stock físico negativo.');
    return {
        valid: errors.length === 0,
        errors,
        // Contrato futuro: cantidades independientes; la merma nunca se factura.
        movement: {
            type,
            warehouseCode: warehouse || null,
            locationCode: location || null,
            productCode: product?.code || null,
            lotCode: lot?.code || null,
            rollCode: rollCode || null,
            unit,
            documentReference: String(reference || '').trim() || null,
            reasonCode: String(reason || '').trim() || null,
            note: String(note || '').trim() || null,
            physicalBefore: fromHundredths(current),
            reservedBefore: fromHundredths(reserved),
            deliveredQuantity: fromHundredths(billed),
            wasteQuantity: fromHundredths(loss),
            stockDelta: fromHundredths(delta),
            physicalAfter: fromHundredths(projected),
            billableQuantity: fromHundredths(billed),
        },
    };
}
