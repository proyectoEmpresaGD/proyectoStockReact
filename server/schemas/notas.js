// server/schemas/notas.js
import Joi from 'joi';

export const validateNota = data => {
    const schema = Joi.object({
        titulo: Joi.string().trim().min(1).max(100).required(),
        contenido: Joi.string().trim().min(1).max(5000).required()
    });
    const result = schema.validate(data, { stripUnknown: true });
    return { success: !result.error, value: result.value, error: result.error };
};

export const validatePartialNota = data => {
    const schema = Joi.object({
        titulo: Joi.string().trim().min(1).max(100),
        contenido: Joi.string().trim().min(1).max(5000),
        eventId: Joi.number().integer().allow(null)
    });
    const result = schema.validate(data, { stripUnknown: true });
    return { success: !result.error, value: result.value, error: result.error };
};
