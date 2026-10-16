import { buildSgaPreview, MOVEMENT_TYPES } from './sgaRules.js';

// Validación progresiva: el operario solo puede avanzar después de completar
// los datos de la pantalla actual. La comprobación definitiva siempre vuelve
// a ejecutarse antes de mostrar el borrador de documento.
export function validateSgaStep(step, { type, product, lot, form }) {
    const errors = [];
    if (step === 0 && !product?.code) errors.push('Selecciona un producto para continuar.');
    if (step === 1) {
        if (!product?.code) errors.push('Selecciona primero un producto.');
        if (!form.warehouse) errors.push('Selecciona un almacén.');
        if (!form.location) errors.push('Selecciona una ubicación.');
        if (!lot?.code) errors.push('Selecciona un lote o introduce el código del nuevo lote.');
        if (form.lotCode === '__NEW__' && type !== MOVEMENT_TYPES.ENTRY) errors.push('Solo se puede crear un lote desde una entrada.');
        if (form.lotCode === '__NEW__' && !String(form.newLotCode || '').trim()) errors.push('Introduce el código del nuevo lote.');
    }
    if (step === 2) {
        const checked = buildSgaPreview({ type, product, lot, ...form });
        errors.push(...checked.errors);
        if (type === MOVEMENT_TYPES.ENTRY && !String(form.reference || '').trim()) {
            errors.push('Indica el documento de recepción.');
        }
        if (type === MOVEMENT_TYPES.ADJUST && form.reason === 'OTROS' && !String(form.note || '').trim()) {
            errors.push('Describe el motivo de la regularización.');
        }
    }
    return [...new Set(errors)];
}

export function validateSgaOperation(data) {
    const errors = [0, 1, 2].flatMap((step) => validateSgaStep(step, data));
    return [...new Set(errors)];
}

export const SGA_STEPS = Object.freeze([
    'Producto', 'Almacén y lote', 'Cantidades', 'Comprobar', 'Documento',
]);
