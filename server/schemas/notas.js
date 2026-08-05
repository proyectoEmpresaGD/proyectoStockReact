import Joi from 'joi';

const noteTypes = ['general', 'seguimiento', 'llamada', 'correo', 'acuerdo', 'incidencia', 'presupuesto', 'muestra', 'tarea'];
const priorities = ['baja', 'media', 'alta', 'urgente'];
const states = ['activa', 'pendiente', 'completada', 'archivada'];

const fields = {
    titulo: Joi.string().trim().min(1).max(160),
    contenido: Joi.string().trim().min(1).max(12000),
    cliente_id: Joi.string().trim().max(40).allow('', null),
    tipo: Joi.string().valid(...noteTypes),
    prioridad: Joi.string().valid(...priorities),
    estado: Joi.string().valid(...states),
    destacada: Joi.boolean(),
    fecha_seguimiento: Joi.date().iso().allow(null),
    assigned_to: Joi.number().integer().positive().allow(null),
    eventos: Joi.array().items(Joi.number().integer().positive()).max(100),
    recordatorio_fecha: Joi.date().iso().greater('now').allow(null),
};

const createSchema = Joi.object({
    ...fields,
    titulo: fields.titulo.required(),
    contenido: fields.contenido.required(),
});

const { recordatorio_fecha: _recordatorioFecha, ...updateFields } = fields;
const updateSchema = Joi.object(updateFields).min(1);

function run(schema, data) {
    const result = schema.validate(data, { stripUnknown: true, abortEarly: false, convert: true });
    return result.error
        ? { success: false, error: result.error, value: result.value }
        : { success: true, value: result.value, error: null };
}

export const validateNota = (data) => run(createSchema, data);
export const validatePartialNota = (data) => run(updateSchema, data);
