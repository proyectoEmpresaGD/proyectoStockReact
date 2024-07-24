// schemas/equivproveSchema.js
import z from 'zod';

const equivproveSchema = z.object({
    Empresa: z.string({
        required_error: 'Empresa is required.',
        invalid_type_error: 'Empresa must be a string.'
    }),
    Ejercicio: z.string({
        required_error: 'Ejercicio is required.',
        invalid_type_error: 'Ejercicio must be a string.'
    }),
    CodProdu: z.string({
        required_error: 'CodProdu is required.',
        invalid_type_error: 'CodProdu must be a string.'
    }),
    CodProve: z.string({
        required_error: 'CodProve is required.',
        invalid_type_error: 'CodProve must be a string.'
    }),
    RazProve: z.string().optional(),
    CodEquiv: z.string({
        required_error: 'CodEquiv is required.',
        invalid_type_error: 'CodEquiv must be a string.'
    }),
    DesEquiv: z.string().optional()
});

export function validateEquivprove(input) {
    return equivproveSchema.safeParse(input);
}

export function validatePartialEquivprove(input) {
    return equivproveSchema.partial().safeParse(input);
}
