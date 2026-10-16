import { MOVEMENT_TYPES, qtyText } from './sgaRules.js';

const metric = (value, unit) => `${qtyText(Number(value) || 0)} ${unit}`;

/**
 * Datos del borrador calculados a partir de una operación YA validada.
 * El documento destinado al cliente nunca recibe un campo de merma.
 */
export function buildSgaDraft({ operation, preview, product, lot, warehouse, location, kind = 'interno' }) {
    if (!preview?.valid) throw new Error('No es posible preparar un borrador con datos sin validar.');
    const movement = preview.movement;
    const forClient = operation === MOVEMENT_TYPES.EXIT && kind === 'entrega';
    const title = operation === MOVEMENT_TYPES.ENTRY
        ? 'Entrada de mercancía'
        : operation === MOVEMENT_TYPES.ADJUST ? 'Parte de regularización'
            : forClient ? 'Documento de preparación para cliente' : 'Parte interno de corte';

    const itemRows = [
        ['Producto', product?.description || '—'], ['Código', product?.code || '—'],
        ['Lote', lot?.code || '—'], ['Almacén', warehouse?.name || movement.warehouseCode || '—'],
    ];
    if (!forClient) itemRows.push(['Ubicación', location?.name || movement.locationCode || '—']);
    if (movement.documentReference) itemRows.push(['Referencia', movement.documentReference]);

    let resultRows = [];
    if (operation === MOVEMENT_TYPES.ENTRY) {
        resultRows = [
            ['Cantidad recibida', metric(movement.stockDelta, movement.unit)],
            ['Stock físico antes', metric(movement.physicalBefore, movement.unit)],
            ['Stock físico previsto', metric(movement.physicalAfter, movement.unit)],
        ];
    } else if (operation === MOVEMENT_TYPES.ADJUST) {
        resultRows = [
            ['Stock físico contado', metric(movement.physicalAfter, movement.unit)],
            ['Diferencia de inventario', `${movement.stockDelta > 0 ? '+' : ''}${metric(movement.stockDelta, movement.unit)}`],
            ['Motivo', movement.reasonCode || '—'],
        ];
    } else if (forClient) {
        resultRows = [['Cantidad preparada para entrega', metric(movement.billableQuantity, movement.unit)]];
    } else if (operation === MOVEMENT_TYPES.EXIT) {
        resultRows = [
            ['Cantidad para entregar', metric(movement.deliveredQuantity, movement.unit)],
            ['Merma interna (no se factura)', metric(movement.wasteQuantity, movement.unit)],
            ['Descuento total de stock', metric(-movement.stockDelta, movement.unit)],
            ['Stock físico previsto', metric(movement.physicalAfter, movement.unit)],
        ];
    }
    return { title, forClient, itemRows, resultRows, note: forClient ? '' : movement.note || '' };
}
