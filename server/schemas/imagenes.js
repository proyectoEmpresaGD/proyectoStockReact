import z from 'zod';

const imagenSchema = z.object({
    empresa: z.string({
        required_error: 'Empresa is required.',
        invalid_type_error: 'Empresa must be a string.'
    }).max(10, 'Empresa cannot be longer than 10 characters'),
    ejercicio: z.string({
        required_error: 'Ejercicio is required.',
        invalid_type_error: 'Ejercicio must be a string.'
    }).max(10, 'Ejercicio cannot be longer than 10 characters'),
    codprodu: z.string({
        required_error: 'CodProdu is required.',
        invalid_type_error: 'CodProdu must be a string.'
    }).max(50, 'CodProdu cannot be longer than 50 characters'),
    linea: z.number({
        required_error: 'Linea is required.',
        invalid_type_error: 'Linea must be a number.'
    }).int('Linea must be an integer'),
    descripcion: z.string({
        required_error: 'Descripcion is required.',
        invalid_type_error: 'Descripcion must be a string.'
    }),
    codclaarchivo: z.string({
        required_error: 'CodClaArchivo is required.',
        invalid_type_error: 'CodClaArchivo must be a string.'
    }).max(50, 'CodClaArchivo cannot be longer than 50 characters').default('default_value'),
    ficadjunto: z.string({
        required_error: 'FicAdjunto is required.',
        invalid_type_error: 'FicAdjunto must be a string.'
    }),
    tipdocasociado: z.string({
        required_error: 'TipDocAsociado is required.',
        invalid_type_error: 'TipDocAsociado must be a string.'
    }).max(50, 'TipDocAsociado cannot be longer than 50 characters'),
    fecalta: z.bigint({
        required_error: 'FecAlta is required.',
        invalid_type_error: 'FecAlta must be a bigint.'
    }),
    ultfeccompra: z.bigint({
        required_error: 'UltFecCompra is required.',
        invalid_type_error: 'UltFecCompra must be a bigint.'
    }),
    ultfecventa: z.bigint({
        required_error: 'UltFecVenta is required.',
        invalid_type_error: 'UltFecVenta must be a bigint.'
    }),
    ultfecactprc: z.bigint({
        required_error: 'UltFecActPrc is required.',
        invalid_type_error: 'UltFecActPrc must be a bigint.'
    })
});

export function validateImagen(input) {
    return imagenSchema.safeParse(input);
}

export function validatePartialImagen(input) {
    return imagenSchema.partial().safeParse(input);
}
