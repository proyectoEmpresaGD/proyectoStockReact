/**
 * Motivos predefinidos para una tablet de almacén. Se registran en los mismos
 * campos auditables existentes: no crean nuevas operaciones ni evitan la
 * revisión física obligatoria.
 */
export const TABLET_REVIEW_ACTIONS = Object.freeze({
    pause: {
        title: 'Pausar la preparación',
        message: 'Se guardará el trabajo y no se enviará ningún albarán. Podrás continuarlo tras una revisión física.',
        requiresPhysicalCheck: false,
        options: [
            'Falta localizar material en el almacén',
            'Cambio de turno: continuará otro momento',
            'Incidencia en el pedido: requiere comprobación',
        ],
    },
    resume: {
        title: 'Continuar una preparación pausada',
        message: 'Comprueba físicamente las cantidades y las piezas preparadas antes de continuar.',
        requiresPhysicalCheck: true,
        options: [
            'He contado y cotejado las unidades con el pedido',
            'He comprobado las piezas, lotes y cantidades',
            'He verificado el trabajo pendiente con otro responsable',
        ],
    },
    recover: {
        title: 'Recuperar un pedido bloqueado',
        message: 'El bloqueo anterior caducó. La revisión física es obligatoria para no duplicar preparaciones.',
        requiresPhysicalCheck: true,
        options: [
            'He comprobado el pedido y todas las unidades separadas',
            'He revisado las piezas y los lotes ya preparados',
            'He cotejado el trabajo pendiente con el responsable',
        ],
    },
});

/** Crea un motivo legible y válido para el contrato existente (15..500 chars). */
export function composeTabletReviewReason(choice, notes = '', { other = false } = {}) {
    const selected = String(choice || '').trim();
    const detail = String(notes || '').trim();
    const reason = other ? detail : [selected, detail].filter(Boolean).join('. ');
    return reason.length >= 15 && reason.length <= 500 ? reason : '';
}

export function describeTabletSaveState(status, { paused = false, sealed = false } = {}) {
    if (paused) return { label: 'Preparación pausada y guardada', tone: 'warning', allowsNext: false };
    if (sealed) return { label: 'Preparación cerrada para revisión', tone: 'warning', allowsNext: false };
    switch (status) {
        case 'saved': return { label: 'Guardado correctamente', tone: 'success', allowsNext: true };
        case 'saving': return { label: 'Guardando cambios…', tone: 'pending', allowsNext: false };
        case 'error': return { label: 'No se ha podido guardar', tone: 'error', allowsNext: false };
        default: return { label: 'Aún no se ha guardado', tone: 'pending', allowsNext: false };
    }
}

/** Instrucción para el puesto de almacén; los códigos se dejan para el encargado. */
export function describeTabletOperationResult(state, { verified = false, uncertain = false } = {}) {
    if (verified && !uncertain) return {
        title: 'Albarán comprobado',
        message: 'El albarán está verificado. Comprueba si quedan productos pendientes antes de cambiar de pedido.',
        tone: 'success',
    };
    if (state === 'PAUSED') return {
        title: 'Pedido guardado para más tarde',
        message: 'No se ha enviado a CDI. Solo podrás continuar después de comprobar físicamente lo preparado.',
        tone: 'warning',
    };
    if (state === 'PREPARED') return {
        title: 'Preparado, pero todavía no enviado',
        message: 'No crees otra preparación. Recupera este trabajo y revisa sus cantidades antes de enviar.',
        tone: 'warning',
    };
    if (state === 'REJECTED') return {
        title: 'CDI ha rechazado el intento',
        message: 'No se ha confirmado ningún albarán. Avisa al responsable para revisar los datos; no generes un segundo intento por tu cuenta.',
        tone: 'error',
    };
    return {
        title: 'No está confirmado: necesita revisión',
        message: 'El albarán podría haberse creado o no. No pulses generar de nuevo. Comprueba esta misma operación en CDI con el responsable.',
        tone: 'warning',
    };
}
