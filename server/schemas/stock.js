import z from 'zod';

const stockSchema = z.object({
    empresa: z.string({
        required_error: 'Empresa is required.',
        invalid_type_error: 'Empresa must be a string.'
    }),
    ejercicio: z.number().int({
        required_error: 'Ejercicio is required.',
        invalid_type_error: 'Ejercicio must be an integer.'
    }),
    codprodu: z.string({
        required_error: 'Codprodu is required.',
        invalid_type_error: 'Codprodu must be a string.'
    }),
    stockinicial: z.number().refine(val => val >= 0, {
        message: 'Stockinicial must be a non-negative number.',
        path: ['stockinicial']
    }).optional(),
    cancompra: z.number().refine(val => val >= 0, {
        message: 'Cancompra must be a non-negative number.',
        path: ['cancompra']
    }).optional(),
    canvendi: z.number().refine(val => val >= 0, {
        message: 'Canvendi must be a non-negative number.',
        path: ['canvendi']
    }).optional(),
    canentra: z.number().refine(val => val >= 0, {
        message: 'Canentra must be a non-negative number.',
        path: ['canentra']
    }).optional(),
    cansalida: z.number().refine(val => val >= 0, {
        message: 'Cansalida must be a non-negative number.',
        path: ['cansalida']
    }).optional(),
    canfabri: z.number().refine(val => val >= 0, {
        message: 'Canfabri must be a non-negative number.',
        path: ['canfabri']
    }).optional(),
    canconsum: z.number().refine(val => val >= 0, {
        message: 'Canconsum must be a non-negative number.',
        path: ['canconsum']
    }).optional(),
    stockactual: z.number().refine(val => val >= 0, {
        message: 'Stockactual must be a non-negative number.',
        path: ['stockactual']
    }).optional(),
    canpenrecib: z.number().refine(val => val >= 0, {
        message: 'Canpenrecib must be a non-negative number.',
        path: ['canpenrecib']
    }).optional(),
    canpenservir: z.number().refine(val => val >= 0, {
        message: 'Canpenservir must be a non-negative number.',
        path: ['canpenservir']
    }).optional(),
    canpenentra: z.number().refine(val => val >= 0, {
        message: 'Canpenentra must be a non-negative number.',
        path: ['canpenentra']
    }).optional(),
    canpensalida: z.number().refine(val => val >= 0, {
        message: 'Canpensalida must be a non-negative number.',
        path: ['canpensalida']
    }).optional(),
    canpenfabri: z.number().refine(val => val >= 0, {
        message: 'Canpenfabri must be a non-negative number.',
        path: ['canpenfabri']
    }).optional(),
    canpenconsum: z.number().refine(val => val >= 0, {
        message: 'Canpenconsum must be a non-negative number.',
        path: ['canpenconsum']
    }).optional(),
    stockprevisto: z.number().refine(val => val >= 0, {
        message: 'Stockprevisto must be a non-negative number.',
        path: ['stockprevisto']
    }).optional(),
});

export function validateStock(input) {
    return stockSchema.safeParse(input);
}

export function validatePartialStock(input) {
    return stockSchema.partial().safeParse(input);
}