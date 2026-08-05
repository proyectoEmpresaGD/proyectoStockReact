import Joi from 'joi';

const visitTypes = ['visita', 'llamada', 'reunion', 'videollamada', 'tarea', 'seguimiento'];
const priorities = ['baja', 'media', 'alta', 'urgente'];

const dateField = Joi.date().iso();

function validateFollowUpPair(value, helpers) {
    const hasAction = typeof value.proxima_accion === 'string' && value.proxima_accion.trim().length > 0;
    const hasDate = Boolean(value.fecha_proxima_accion);
    if (hasAction !== hasDate) {
        return helpers.error('any.invalid', { message: 'La próxima acción y su fecha deben indicarse juntas' });
    }
    return value;
}


const visitFields = {
    cliente_id: Joi.string().trim().max(40),
    fecha: dateField,
    fecha_fin: dateField.allow(null),
    duracion_minutos: Joi.number().integer().min(15).max(1440),
    titulo: Joi.string().trim().min(2).max(160),
    descripcion: Joi.string().allow('').max(8000),
    tipo: Joi.string().valid(...visitTypes),
    prioridad: Joi.string().valid(...priorities),
    assigned_to: Joi.number().integer().positive().allow(null),
    proxima_accion: Joi.string().allow('').max(2000).allow(null),
    fecha_proxima_accion: dateField.allow(null),
    recordatorio_fecha: dateField.greater('now').allow(null),
};

export const createVisitSchema = Joi.object({
    ...visitFields,
    cliente_id: visitFields.cliente_id.required(),
    fecha: visitFields.fecha.required(),
    titulo: visitFields.titulo.required(),
}).custom((value, helpers) => {
    if (value.fecha_fin && new Date(value.fecha_fin) <= new Date(value.fecha)) {
        return helpers.error('any.invalid', { message: 'La fecha de fin debe ser posterior al inicio' });
    }
    if (value.recordatorio_fecha && new Date(value.recordatorio_fecha) >= new Date(value.fecha)) {
        return helpers.error('any.invalid', { message: 'El recordatorio debe ser anterior al inicio de la visita' });
    }
    return validateFollowUpPair(value, helpers);
});


export const createCompletedVisitSchema = Joi.object({
    ...visitFields,
    cliente_id: visitFields.cliente_id.required(),
    fecha: visitFields.fecha.required(),
    titulo: visitFields.titulo.required(),
    resultado: Joi.string().trim().min(1).max(8000).required(),
    recordatorio_fecha: Joi.forbidden(),
}).custom((value, helpers) => {
    if (value.fecha_fin && new Date(value.fecha_fin) <= new Date(value.fecha)) {
        return helpers.error('any.invalid', { message: 'La fecha de fin debe ser posterior al inicio' });
    }
    if (new Date(value.fecha).getTime() > Date.now() + 5 * 60 * 1000) {
        return helpers.error('any.invalid', { message: 'Una visita realizada no puede tener una fecha futura' });
    }
    return validateFollowUpPair(value, helpers);
});

export const updateVisitSchema = Joi.object(visitFields).min(1).custom((value, helpers) => {
    if (value.fecha && value.fecha_fin && new Date(value.fecha_fin) <= new Date(value.fecha)) {
        return helpers.error('any.invalid', { message: 'La fecha de fin debe ser posterior al inicio' });
    }
    if (value.fecha && value.recordatorio_fecha && new Date(value.recordatorio_fecha) >= new Date(value.fecha)) {
        return helpers.error('any.invalid', { message: 'El recordatorio debe ser anterior al inicio de la visita' });
    }
    return value;
});

export const completeVisitSchema = Joi.object({
    resultado: Joi.string().trim().min(1).max(8000).required(),
    proxima_accion: Joi.string().trim().max(2000).allow('', null),
    fecha_proxima_accion: dateField.allow(null),
}).custom(validateFollowUpPair);

export const cancelVisitSchema = Joi.object({
    motivo: Joi.string().trim().max(2000).allow('', null),
});

export const reminderSchema = Joi.object({
    visita_id: Joi.number().integer().positive().allow(null),
    nota_id: Joi.number().integer().positive().allow(null),
    fecha_recordatorio: dateField.greater('now').required(),
    titulo: Joi.string().trim().max(180).allow('', null),
    mensaje: Joi.string().trim().max(2000).allow('', null),
}).or('visita_id', 'nota_id');

export const snoozeSchema = Joi.object({
    until: Joi.date().iso().greater('now').required(),
});

export function validate(schema, payload) {
    const result = schema.validate(payload, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });
    if (!result.error) return { success: true, value: result.value };
    const message = result.error.details
        .map((detail) => detail.context?.message || detail.message.replace(/"/g, ''))
        .join('. ');
    return { success: false, error: message };
}
