import { Client } from 'basic-ftp';
import path from 'path';
import { Readable } from 'stream';
import slugifyLib from 'slugify';
import { NotasModel } from '../models/Postgres/notas.js';
import { validateNota, validatePartialNota } from '../schemas/notas.js';

const FTP_BASE = process.env.FTP_BASE_PATH;
const IMG_BASE_URL = process.env.IMG_BASE_URL;

const slugify = (text) => slugifyLib(String(text || ''), { lower: true, strict: true });

function parseArray(raw) {
    if (raw == null || raw === '') return [];
    const values = Array.isArray(raw) ? raw : [raw];
    return [...new Set(values.flatMap((value) => {
        if (typeof value === 'string' && value.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return value.split(',');
            }
        }
        return typeof value === 'string' ? value.split(',') : [value];
    }).map((value) => String(value).trim()).filter(Boolean))];
}

function parseIds(raw) {
    return parseArray(raw)
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0);
}

function parseBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'si', 'sí'].includes(String(value).trim().toLowerCase());
}

function fileNameFromValue(value) {
    const stringValue = String(value || '').trim();
    if (!stringValue) return '';
    try {
        const decoded = decodeURIComponent(stringValue);
        return path.posix.basename(new URL(decoded, 'https://local.invalid').pathname);
    } catch {
        return path.posix.basename(stringValue);
    }
}

function buildRemoteBase(note) {
    const date = new Date(note.fechacreado || Date.now());
    return path.posix.join(
        FTP_BASE || '/',
        String(note.idusuario),
        'NOTAS',
        String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    );
}

function legacyFolderName(note) {
    return `${slugify(note.titulo).slice(0, 50) || 'nota'}-${note.id}`;
}

function preferredFolderName(note) {
    return note.carpeta_imagenes || `nota-${note.id}`;
}

function buildImageUrls(note) {
    const base = String(IMG_BASE_URL || '').replace(/\/$/, '');
    if (!base) return [];
    const folder = note.carpeta_imagenes || legacyFolderName(note);
    const relative = path.posix.join(buildRemoteBase(note).replace(/^\/+/, ''), folder);
    return (Array.isArray(note.imagenes) ? note.imagenes : [])
        .map(fileNameFromValue)
        .filter(Boolean)
        .map((name) => `${base}/${relative}/${encodeURIComponent(name)}`);
}

function serializeNote(note) {
    return {
        ...note,
        eventos: (note.eventos || []).map(Number).filter(Number.isFinite),
        visitas_relacionadas: Array.isArray(note.visitas_relacionadas) ? note.visitas_relacionadas : [],
        imagenes: buildImageUrls(note),
    };
}

async function withFtp(fn) {
    const client = new Client();
    client.ftp.timeout = Number(process.env.FTP_TIMEOUT_MS) || 8000;
    await client.access({
        host: process.env.FTP_HOST,
        port: Number(process.env.FTP_PORT) || 21,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: process.env.FTP_SECURE === 'true',
    });
    try {
        return await fn(client);
    } finally {
        client.close();
    }
}

async function resolveExistingFolder(client, note) {
    const baseDir = buildRemoteBase(note);
    const candidates = [note.carpeta_imagenes, `nota-${note.id}`, legacyFolderName(note)].filter(Boolean);
    try {
        const items = await client.list(baseDir);
        for (const candidate of candidates) {
            const exact = items.find((item) => item.isDirectory && item.name === candidate);
            if (exact) return path.posix.join(baseDir, exact.name);
        }
        const byId = items.find((item) => item.isDirectory && item.name.endsWith(`-${note.id}`));
        if (byId) return path.posix.join(baseDir, byId.name);
    } catch (error) {
        console.warn('No se pudo inspeccionar la carpeta FTP de la nota:', error?.message || error);
    }
    return path.posix.join(baseDir, preferredFolderName(note));
}

function notePayloadFromBody(body, { partial = false } = {}) {
    const payload = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

    if (!partial || has('titulo')) payload.titulo = body.titulo;
    if (!partial || has('contenido')) payload.contenido = body.contenido;
    if (!partial || has('cliente_id')) payload.cliente_id = body.cliente_id || null;
    if (!partial || has('tipo')) payload.tipo = body.tipo || 'general';
    if (!partial || has('prioridad')) payload.prioridad = body.prioridad || 'media';
    if (!partial || has('estado')) payload.estado = body.estado || 'activa';
    if (!partial || has('destacada')) payload.destacada = parseBoolean(body.destacada, false);
    if (!partial || has('fecha_seguimiento')) payload.fecha_seguimiento = body.fecha_seguimiento || null;
    if (!partial || has('assigned_to')) payload.assigned_to = body.assigned_to ? Number(body.assigned_to) : null;
    if (!partial || has('recordatorio_fecha')) payload.recordatorio_fecha = body.recordatorio_fecha || null;

    const hasEvents = has('eventos') || has('eventos[]');
    if (hasEvents) payload.eventos = parseIds(body['eventos[]'] ?? body.eventos);

    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    return payload;
}

function sendModelError(res, error, fallback) {
    console.error(fallback, error);
    if (error?.code === 'NOTE_VISIT_ACCESS') return res.status(400).json({ error: error.message });
    if (['AGENDA_ASSIGNEE_INVALID', 'AGENDA_CLIENT_INVALID', 'AGENDA_DATE_RANGE_INVALID'].includes(error?.code)) {
        return res.status(400).json({ error: error.message });
    }
    if (error?.code === '23503') return res.status(400).json({ error: 'El cliente, responsable o visita relacionada no existe' });
    return res.status(500).json({ error: fallback });
}

export class NotasController {
    async getAll(req, res) {
        try {
            const options = {
                user: req.user,
                query: typeof req.query.q === 'string' ? req.query.q : null,
                limit: req.query.limit,
                offset: req.query.offset,
                type: req.query.type || null,
                priority: req.query.priority || null,
                state: req.query.state || null,
                clientId: req.query.client_id || null,
                featured: req.query.featured === 'true' ? true : null,
                followUp: req.query.follow_up === 'true' ? true : null,
                visitId: req.query.visit_id || null,
            };
            const [items, total] = await Promise.all([
                NotasModel.getAll(options),
                NotasModel.getCount(options),
            ]);
            res.json({
                items: items.map(serializeNote),
                total,
                limit: Number(options.limit) || 40,
                offset: Number(options.offset) || 0,
            });
        } catch (error) {
            sendModelError(res, error, 'No se pudieron obtener las notas');
        }
    }

    async getById(req, res) {
        try {
            const note = await NotasModel.getById({ id: req.params.id, user: req.user });
            if (!note) return res.status(404).json({ error: 'Nota no encontrada o sin acceso' });
            res.json(serializeNote(note));
        } catch (error) {
            sendModelError(res, error, 'No se pudo obtener la nota');
        }
    }

    async create(req, res) {
        const payload = notePayloadFromBody(req.body);
        const checked = validateNota(payload);
        if (!checked.success) {
            return res.status(400).json({ error: checked.error.details.map((item) => item.message).join('. ') });
        }

        let note;
        try {
            note = await NotasModel.create({ input: checked.value, user: req.user });
        } catch (error) {
            return sendModelError(res, error, 'No se pudo crear la nota');
        }

        const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);
        const imageNames = [];
        const folder = `nota-${note.id}`;
        if (ftpReady && req.files?.length) {
            try {
                await withFtp(async (client) => {
                    const remoteDir = path.posix.join(buildRemoteBase(note), folder);
                    await client.ensureDir(remoteDir);
                    for (const file of req.files) {
                        const safeName = path.posix.basename(file.originalname);
                        await client.uploadFrom(Readable.from(file.buffer), path.posix.join(remoteDir, safeName));
                        imageNames.push(safeName);
                    }
                });
            } catch (error) {
                console.error('Error subiendo imágenes de nota:', error);
            }
        }

        try {
            const updated = await NotasModel.update({
                id: note.id,
                user: req.user,
                input: { imagenes: imageNames, carpeta_imagenes: folder },
            });
            res.status(201).json(serializeNote(updated || note));
        } catch (error) {
            sendModelError(res, error, 'La nota se creó, pero no se pudo finalizar la información de imágenes');
        }
    }

    async update(req, res) {
        const id = Number(req.params.id);
        let existing;
        try {
            existing = await NotasModel.getById({ id, user: req.user, requireOwner: true });
        } catch (error) {
            return sendModelError(res, error, 'No se pudo cargar la nota');
        }
        if (!existing) return res.status(404).json({ error: 'Nota no encontrada o sin permiso de edición' });

        const payload = notePayloadFromBody(req.body, { partial: true });
        const checked = validatePartialNota(payload);
        if (!checked.success) {
            return res.status(400).json({ error: checked.error.details.map((item) => item.message).join('. ') });
        }

        const keepProvided = Object.prototype.hasOwnProperty.call(req.body, 'keep_imagenes')
            || Object.prototype.hasOwnProperty.call(req.body, 'keep_imagenes[]');
        const removedProvided = Object.prototype.hasOwnProperty.call(req.body, 'removed_images')
            || Object.prototype.hasOwnProperty.call(req.body, 'removed_images[]');
        const currentNames = (existing.imagenes || []).map(fileNameFromValue).filter(Boolean);
        const keepRequested = parseArray(req.body['keep_imagenes[]'] ?? req.body.keep_imagenes)
            .map(fileNameFromValue)
            .filter(Boolean);
        const removed = new Set(parseArray(req.body['removed_images[]'] ?? req.body.removed_images).map(fileNameFromValue));
        let keep = currentNames;
        if (keepProvided) {
            const currentSet = new Set(currentNames);
            keep = keepRequested.filter((name) => currentSet.has(name));
        } else if (removedProvided) {
            keep = currentNames.filter((name) => !removed.has(name));
        }

        const incomingFiles = Array.isArray(req.files) ? req.files : [];
        if (keep.length + incomingFiles.length > 3) {
            return res.status(400).json({ error: 'Máximo 3 imágenes por nota' });
        }

        const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);
        const newNames = [];
        let folderName = existing.carpeta_imagenes || null;

        // Primero se suben los nuevos archivos, pero no se elimina ningún adjunto
        // existente hasta que PostgreSQL confirme la actualización. Si la consulta SQL
        // falla, como máximo quedan archivos huérfanos; nunca una nota válida sin imágenes.
        if (ftpReady && (incomingFiles.length || (!folderName && currentNames.length))) {
            try {
                await withFtp(async (client) => {
                    const remoteDir = await resolveExistingFolder(client, existing);
                    folderName = path.posix.basename(remoteDir);
                    await client.ensureDir(remoteDir);
                    for (const file of incomingFiles) {
                        const safeName = path.posix.basename(file.originalname);
                        await client.uploadFrom(Readable.from(file.buffer), path.posix.join(remoteDir, safeName));
                        newNames.push(safeName);
                    }
                });
            } catch (error) {
                console.error('Error subiendo imágenes de nota:', error);
                return res.status(502).json({ error: 'No se pudieron subir las imágenes. La nota no se ha modificado.' });
            }
        }

        const finalImageNames = [...keep, ...newNames];
        const input = {
            ...checked.value,
            imagenes: finalImageNames,
        };
        if (folderName) input.carpeta_imagenes = folderName;
        try {
            const updated = await NotasModel.update({ id, input, user: req.user });
            if (!updated) return res.status(404).json({ error: 'Nota no encontrada o sin permiso de edición' });

            // La limpieza se realiza después del guardado y es deliberadamente
            // tolerante a fallos. Un error FTP deja, como mucho, archivos sobrantes.
            if (ftpReady && (keepProvided || removedProvided) && folderName) {
                withFtp(async (client) => {
                    const remoteDir = await resolveExistingFolder(client, { ...existing, carpeta_imagenes: folderName });
                    const files = await client.list(remoteDir).catch(() => []);
                    const finalSet = new Set(finalImageNames);
                    for (const file of files) {
                        if (!file.isDirectory && !finalSet.has(file.name)) {
                            await client.remove(path.posix.join(remoteDir, file.name));
                        }
                    }
                }).catch((cleanupError) => {
                    console.error('La nota se actualizó, pero quedó pendiente limpiar archivos FTP:', cleanupError);
                });
            }

            res.json(serializeNote(updated));
        } catch (error) {
            sendModelError(res, error, 'No se pudo actualizar la nota');
        }
    }

    async delete(req, res) {
        const id = Number(req.params.id);
        let note;
        try {
            note = await NotasModel.getById({ id, user: req.user, requireOwner: true });
        } catch (error) {
            return sendModelError(res, error, 'No se pudo cargar la nota');
        }
        if (!note) return res.status(404).json({ error: 'Nota no encontrada o sin permiso para eliminarla' });

        try {
            const deleted = await NotasModel.delete({ id, user: req.user });
            if (!deleted) return res.status(404).json({ error: 'Nota no encontrada o sin permiso para eliminarla' });
        } catch (error) {
            return sendModelError(res, error, 'No se pudo eliminar la nota');
        }

        // La base de datos es la fuente principal. La limpieza FTP se realiza después
        // para evitar dejar una nota existente sin imágenes si la eliminación SQL falla.
        const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);
        if (ftpReady) {
            try {
                await withFtp(async (client) => {
                    const folder = await resolveExistingFolder(client, note);
                    const parent = path.posix.dirname(folder);
                    const name = path.posix.basename(folder);
                    const items = await client.list(parent).catch(() => []);
                    if (items.some((item) => item.isDirectory && item.name === name)) {
                        await client.removeDir(folder);
                    }
                });
            } catch (error) {
                console.error('La nota se eliminó, pero quedó pendiente la limpieza de su carpeta FTP:', error);
            }
        }
        res.status(204).end();
    }
}
