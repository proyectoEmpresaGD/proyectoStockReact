/**
 * Diagnóstico y lecturas CDI exclusivos del SGA/admin.
 * No existe ningún endpoint que pueda guardar, servir o anular operaciones.
 */
import { Router } from 'express';
import { CdiReadError, createCdiReadOnlyClient } from '../services/cdiReadOnlyClient.js';
import { createSgaCdiValidation } from '../services/sgaCdiValidation.js';

const ENTITIES = new Set(['CLIENTE', 'PROVEEDOR', 'ARTICULO', 'CONFIGURADO', 'ALMACEN', 'IVA', 'FORMA_PAGO', 'UNIDAD', 'FAMILIA', 'SERIE']);
const DOC_TYPES = new Set(['PR', 'PC', 'PP', 'AC', 'AP']);

function inputError(message) { return new CdiReadError(400, 'CDI_INVALID_INPUT', message); }

function take(query, key, maxLength, { required = false } = {}) {
    const value = query[key];
    if (value === undefined || value === '') {
        if (required) throw inputError(`Falta el campo ${key}.`);
        return undefined;
    }
    if (typeof value !== 'string' || value.length > maxLength || /[\x00-\x1f]/.test(value)) {
        throw inputError(`El campo ${key} es inválido.`);
    }
    return value;
}

function limit(query) {
    const raw = take(query, 'limite', 3) ?? '25';
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) throw inputError('El límite debe estar entre 1 y 100.');
    return Number(raw);
}

function date(query, key) {
    const value = take(query, key, 10);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
        throw inputError(`La fecha ${key} es inválida.`);
    }
    return value;
}

function selectFields(query, allowed) {
    const result = {};
    for (const [field, max] of Object.entries(allowed)) {
        const value = take(query, field, max);
        if (value !== undefined) result[field] = value;
    }
    // No permitimos parámetros inesperados, que podrían ampliar futuras consultas.
    for (const key of Object.keys(query)) {
        if (!Object.hasOwn(allowed, key)) throw inputError(`Parámetro no permitido: ${key}.`);
    }
    return result;
}

function documentIdentity(query, types = DOC_TYPES) {
    const { tipo, anio, serie, clave } = selectFields(query, { tipo: 2, anio: 4, serie: 5, clave: 10 });
    if (!types.has(tipo) || !/^[0-9]{4}$/.test(anio || '') || !serie || !clave) {
        throw inputError('Identidad documental incompleta: tipo, anio, serie y clave.');
    }
    return { tipo, anio, serie, clave };
}

export function createSgaCdiReadRouter({ client = createCdiReadOnlyClient() } = {}) {
    const router = Router();
    const validation = createSgaCdiValidation(client);
    router.use((req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Debes iniciar sesión.' });
        if (String(req.user.role || '').trim().toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Consultas CDI en pruebas: solo administradores.' });
        }
        res.setHeader('Cache-Control', 'no-store, private');
        next();
    });

    const safe = (handler) => async (req, res) => {
        try { return res.json(await handler(req)); }
        catch (error) {
            const status = error instanceof CdiReadError ? error.status : 503;
            if (error?.retryAfter) res.setHeader('Retry-After', error.retryAfter);
            // No registrar payloads, API keys, cabeceras Authorization ni datos de terceros.
            return res.status(status).json({ message: error instanceof CdiReadError ? error.message : 'No se ha completado la consulta CDI.', code: error instanceof CdiReadError ? error.code : 'CDI_UNAVAILABLE' });
        }
    };

    router.get('/status', (req, res) => res.json(client.status()));
    // Diagnósticos guiados: usan exclusivamente maestros.obtener, existencias.listar,
    // pedidos.pendientes y documentos.obtener. No preparan ni guardan movimientos.
    router.get('/validacion/articulo', safe((req) => {
        const params = selectFields(req.query, { codarticulo: 20, codalmacen: 2 });
        if (!params.codarticulo?.trim()) throw inputError('Indica el código exacto del artículo.');
        return validation.article(params);
    }));
    router.get('/validacion/pedido', safe((req) => validation.order(documentIdentity(req.query, new Set(['PC', 'PP'])))));
    router.post('/catalog', safe(() => client.read('catalog')));
    router.get('/maestros', safe((req) => {
        const params = selectFields(req.query, { entidad: 20, texto: 255, limite: 3, cursor: 255 });
        if (!ENTITIES.has(params.entidad)) throw inputError('Entidad de maestros no permitida.');
        params.limite = limit(req.query);
        return client.read('masters', params);
    }));
    router.get('/documentos', safe((req) => {
        const params = selectFields(req.query, { tipo: 2, anio: 4, serie: 5, clave: 10, fecha_desde: 10, fecha_hasta: 10, tercero: 20, estado: 24, limite: 3, despues: 255 });
        if (!DOC_TYPES.has(params.tipo)) throw inputError('Tipo de documento no permitido.');
        if (params.anio && !/^\d{4}$/.test(params.anio)) throw inputError('Año inválido.');
        for (const field of ['fecha_desde', 'fecha_hasta']) if (params[field]) params[field] = date(req.query, field);
        params.limite = limit(req.query);
        return client.read('documents', params);
    }));
    router.get('/documentos/detalle', safe((req) => client.read('document', documentIdentity(req.query))));
    router.get('/pedidos/pendientes', safe((req) => client.read('pending', documentIdentity(req.query, new Set(['PC', 'PP'])))));
    router.get('/existencias', safe((req) => {
        const params = selectFields(req.query, { codalmacen: 2, codarticulo: 20, nserie: 35, codubicacion: 10, idconf: 6, solo_con_saldo: 5, limite: 3, despues: 255, dim1: 32, dim2: 32, dim3: 32 });
        if (!params.codarticulo) throw inputError('Indica un código de artículo para consultar existencias.');
        if (params.solo_con_saldo !== undefined) {
            if (!['true', 'false'].includes(params.solo_con_saldo)) throw inputError('solo_con_saldo debe ser true o false.');
            params.solo_con_saldo = params.solo_con_saldo === 'true';
        }
        for (const field of ['dim1', 'dim2', 'dim3']) {
            if (params[field] !== undefined && !/^-?\d+(\.\d+)?$/.test(params[field])) throw inputError(`${field} no es un número válido.`);
        }
        params.limite = limit(req.query);
        return client.read('stock', params);
    }));
    return router;
}
