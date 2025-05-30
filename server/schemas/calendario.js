import Joi from "joi";

// Esquema completo (POST)
const calendarioSchema = Joi.object({
    descripcion: Joi.string().max(255).allow("").optional(),
    fecha: Joi.date().iso().required().messages({
        "date.base": "fecha debe ser una fecha válida",
        "date.format": "fecha debe tener formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)",
        "any.required": "fecha es obligatoria",
    }),
    notificacion: Joi.date().iso().optional().messages({
        "date.base": "notificacion debe ser una fecha válida",
        "date.format": "notificacion debe tener formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)",
    }),
});

// Esquema parcial (PATCH)
const partialCalendarioSchema = Joi.object({
    descripcion: Joi.string().max(255).allow("").optional(),
    fecha: Joi.date().iso().optional(),
    notificacion: Joi.date().iso().optional(),
})
    .min(1)
    .messages({ "object.min": "Al menos debe proporcionarse un campo para actualizar" });

export const validateCalendario = (data) => {
    const result = calendarioSchema.validate(data, { abortEarly: false });
    return result.error
        ? { success: false, error: result.error }
        : { success: true, value: result.value };
};

export const validatePartialCalendario = (data) => {
    const result = partialCalendarioSchema.validate(data, { abortEarly: false });
    return result.error
        ? { success: false, error: result.error }
        : { success: true, value: result.value };
};
