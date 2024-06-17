import z from 'zod';

const productSchema = z.object({
    CodProdu: z.string({
        required_error: 'Product code is required.',
        invalid_type_error: 'Product code must be a string.'
    }),
    DesProdu: z.string({
        required_error: 'Product description is required.',
        invalid_type_error: 'Product description must be a string.'
    }),
    CodFamil: z.string().optional(),
    CodSubFamil: z.string().optional(),
    CodMarca: z.string().optional(),
    CodTipo: z.string().optional(),
    FecAlta: z.number().int().optional(),
    StockSN: z.string().length(1).optional(),
    PreCosto: z.number().optional(),
    UltCodProve: z.string().optional(),
    UltFecCompra: z.number().int().optional(),
    UltPreCompra: z.number().optional(),
    UltCodClien: z.string().optional(),
    UltFecVenta: z.number().int().optional(),
    UltPreVenta: z.number().optional(),
    CodCtaContabCompra: z.string().optional(),
    CodCtaContabVenta: z.string().optional(),
    Comentario: z.string().optional(),
    NRB: z.string().optional(),
    CodClase: z.string().optional(),
    PRC: z.number().optional(),
    PUFC: z.number().optional(),
    PUFV: z.number().optional(),
    PMC: z.number().optional(),
    PMV: z.number().optional(),
    Operador: z.string().length(1).optional(),
    TraLotes: z.string().length(1).optional(),
    BloqEdicPreVentas: z.string().length(1).optional(),
    TipNumSerie: z.string().length(1).optional(),
    UltPreCompraNeto: z.number().optional(),
    UltPreVentaNeto: z.number().optional(),
    PUFCNeto: z.number().optional(),
    PUFVNeto: z.number().optional(),
    ReqTarCompra: z.string().length(1).optional(),
    PMCImput: z.number().optional(),
    UltFecActPRC: z.number().int().optional(),
    UltPreCompraNetoImput: z.number().optional(),
    PUFCNetoImput: z.number().optional(),
});

export function validateProduct(input) {
    return productSchema.safeParse(input);
}

export function validatePartialProduct(input) {
    return productSchema.partial().safeParse(input);
}
