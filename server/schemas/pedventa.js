import z from 'zod';

const pedventaSchema = z.object({
    Empresa: z.string({
        required_error: 'Empresa is required.',
        invalid_type_error: 'Empresa must be a string.'
    }),
    Ejercicio: z.string({
        required_error: 'Ejercicio is required.',
        invalid_type_error: 'Ejercicio must be a string.'
    }),
    Canal: z.string({
        required_error: 'Canal is required.',
        invalid_type_error: 'Canal must be a string.'
    }),
    CodSerPedVenta: z.string({
        required_error: 'CodSerPedVenta is required.',
        invalid_type_error: 'CodSerPedVenta must be a string.'
    }),
    NPedVenta: z.string({
        required_error: 'NPedVenta is required.',
        invalid_type_error: 'NPedVenta must be a string.'
    }),
    Linea: z.number().int({
        required_error: 'Linea is required.',
        invalid_type_error: 'Linea must be an integer.'
    }),
    CodClien: z.string({
        required_error: 'CodClien is required.',
        invalid_type_error: 'CodClien must be a string.'
    }),
    RazClien: z.string({
        required_error: 'RazClien is required.',
        invalid_type_error: 'RazClien must be a string.'
    }),
    Fecha: z.date({
        required_error: 'Fecha is required.',
        invalid_type_error: 'Fecha must be a date.'
    }),
    FecEntre: z.date({
        required_error: 'FecEntre is required.',
        invalid_type_error: 'FecEntre must be a date.'
    }),
    CodAlmac: z.string({
        required_error: 'CodAlmac is required.',
        invalid_type_error: 'CodAlmac must be a string.'
    }),
    CodProdu: z.string({
        required_error: 'CodProdu is required.',
        invalid_type_error: 'CodProdu must be a string.'
    }),
    DesProdu: z.string({
        required_error: 'DesProdu is required.',
        invalid_type_error: 'DesProdu must be a string.'
    }),
    Cantidad: z.number({
        required_error: 'Cantidad is required.',
        invalid_type_error: 'Cantidad must be a number.'
    }),
    Precio: z.number({
        required_error: 'Precio is required.',
        invalid_type_error: 'Precio must be a number.'
    }),
    Importe: z.number({
        required_error: 'Importe is required.',
        invalid_type_error: 'Importe must be a number.'
    }),
    DT1: z.number().optional(),
    ImpDT1: z.number().optional(),
    DT2: z.number().optional(),
    ImpDT2: z.number().optional(),
    DT3: z.number().optional(),
    ImpDT3: z.number().optional(),
    ImpBruto: z.number().optional(),
    CodIva: z.string().optional()
});

export function validatePedventa(input) {
    return pedventaSchema.safeParse(input);
}

export function validatePartialPedventa(input) {
    return pedventaSchema.partial().safeParse(input);
}
