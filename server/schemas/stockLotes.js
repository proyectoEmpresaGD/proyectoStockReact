import z from 'zod';

const stockLotesSchema = z.object({
    canal: z.number().int({
        required_error: 'Canal is required.',
        invalid_type_error: 'Canal must be an integer.'
    }),
    codAlmac: z.number().int({
        required_error: 'CodAlmac is required.',
        invalid_type_error: 'CodAlmac must be an integer.'
    }),
    codProdu: z.string({
        required_error: 'CodProdu is required.',
        invalid_type_error: 'CodProdu must be a string.'
    }),
    codLote: z.string({
        required_error: 'CodLote is required.',
        invalid_type_error: 'CodLote must be a string.'
    }),
    stockActual: z.number().int().nonnegative({
        message: 'StockActual must be a non-negative integer.',
        invalid_type_error: 'StockActual must be an integer.'
    })
});

export function validateStockPorLotes(input) {
    return stockLotesSchema.safeParse(input);
}

export function validatePartialStockPorLotes(input) {
    return stockLotesSchema.partial().safeParse(input);
}