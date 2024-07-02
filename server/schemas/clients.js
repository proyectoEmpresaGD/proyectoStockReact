import z from 'zod';

const clienteSchema = z.object({
    marcar: z.string().optional(),
    codclien: z.string({
        required_error: 'Client code is required.',
        invalid_type_error: 'Client code must be a string.'
    }),
    razclien: z.string({
        required_error: 'Client name is required.',
        invalid_type_error: 'Client name must be a string.'
    }),
    nif: z.string().optional(),
    cp: z.string().optional(),
    direccion: z.string().optional(),
    localidad: z.string().optional(),
    codpais: z.string().optional(),
    tlfno: z.string().optional(),
    codgesti: z.string().optional(),
    codtarifa: z.string().optional(),
    codforpago: z.string().optional(),
    imppedvalorados: z.number().optional(),
    impalbvalorados: z.number().optional(),
    email: z.string().email().optional(),
    codrepre: z.string().optional(),
    comision: z.number().optional(),
    nrb: z.string().optional(),
    asegurado: z.string().optional(),
    idcp: z.string().optional(),
    codriesgo: z.string().optional(),
    impriesgo: z.number().optional(),
    portes: z.string().optional(),
    tipportes: z.string().optional(),
    dadobaja: z.boolean().optional(),
    codctacontab: z.string().optional(),
    codiva: z.string().optional(),
    forenvio: z.string().optional(),
    commanual: z.boolean().optional(),
    bloqueado: z.boolean().optional(),
    fecalta: z.date().optional(),
    permitiralbsinpedido: z.boolean().optional(),
    reqconfirpartrabajo: z.boolean().optional(),
    codtippersona: z.string().optional(),
    impprenetos: z.number().optional(),
    trabajaconre: z.string().optional(),
    codprovi: z.string().optional(),
    excluirbloqdoccobrosvencidospendientes: z.boolean().optional(),
});

export function validateCliente(input) {
    return clienteSchema.safeParse(input);
}

export function validatePartialCliente(input) {
    return clienteSchema.partial().safeParse(input);
}