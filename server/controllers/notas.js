// server/controllers/notas.js
import { Client } from "basic-ftp";
import path from "path";
import { Readable } from "stream";
import slugifyLib from "slugify";
import { NotasModel } from "../models/Postgres/notas.js";
import { validateNota, validatePartialNota } from "../schemas/notas.js";

const FTP_BASE = process.env.FTP_BASE_PATH;     // ej: /CALENDARIO
const IMG_BASE_URL = process.env.IMG_BASE_URL;  // ej: https://bassari.eu/CALENDARIO

function slugify(text) {
    return slugifyLib(text, { lower: true, strict: true });
}

function normalizeEventos(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw == null) return [];
    return [raw];
}

function buildRemoteBase(nota) {
    const fecha = new Date(nota.fechacreado);
    const yyyy = fecha.getFullYear().toString();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");

    return path.posix.join(
        FTP_BASE || "/",
        String(nota.idusuario),
        "NOTAS",
        yyyy,
        mm,
        dd
    );
}

function buildExpectedFolderName(nota) {
    return `${slugify(nota.titulo).slice(0, 50) || "nota"}-${nota.id}`;
}

async function resolveNoteFolder(client, nota) {
    const baseDir = buildRemoteBase(nota);
    const expected = buildExpectedFolderName(nota);

    try {
        const list = await client.list(baseDir);

        const exact = list.find((item) => item.isDirectory && item.name === expected);
        if (exact) return path.posix.join(baseDir, exact.name);

        const byId = list.find((item) => item.isDirectory && item.name.endsWith(`-${nota.id}`));
        if (byId) return path.posix.join(baseDir, byId.name);
    } catch (err) {
        console.warn("⚠️  No se pudo listar carpeta base de la nota:", err?.message || err);
    }

    return path.posix.join(baseDir, expected);
}

async function filterOwnedEvents(eventos, userId) {
    const numericIds = [...new Set(
        eventos.map((ev) => Number(ev)).filter((n) => Number.isInteger(n) && n > 0)
    )];

    if (numericIds.length === 0) return { filtered: [], rejected: [] };

    const owned = await NotasModel.getOwnedCitasByIds(userId, numericIds);
    const allowed = new Set(owned);
    const filtered = numericIds.filter((id) => allowed.has(id));
    const rejected = numericIds.filter((id) => !allowed.has(id));
    return { filtered, rejected };
}

async function withFtp(fn) {
    const client = new Client();
    client.ftp.timeout = Number(process.env.FTP_TIMEOUT_MS) || 8000;

    await client.access({
        host: process.env.FTP_HOST,
        port: Number(process.env.FTP_PORT) || 21,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: process.env.FTP_SECURE === "true",
    });

    try {
        return await fn(client);
    } finally {
        client.close();
    }
}

export class NotasController {
    async getAll(req, res) {
        const idusuario = req.user.id;
        try {
            const q = typeof req.query.q === "string" ? req.query.q : null;
            const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100;
            const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0;

            const notas = await NotasModel.getAll({ offset, limit, query: q, idusuario });

            const withUrls = notas.map((n) => {
                const fecha = new Date(n.fechacreado);
                const slug = slugify(n.titulo).slice(0, 50) + "-" + n.id;
                const yyyy = fecha.getFullYear().toString();
                const mm = String(fecha.getMonth() + 1).padStart(2, "0");
                const dd = String(fecha.getDate()).padStart(2, "0");

                const relPath = `${n.idusuario}/NOTAS/${yyyy}/${mm}/${dd}/${slug}`;
                const baseUrl = (IMG_BASE_URL || "").replace(/\/$/, "");
                const imagenes = (n.imagenes || []).map(
                    (name) => `${baseUrl}/${relPath}/${encodeURIComponent(name)}`
                );

                return { ...n, imagenes };
            });

            res.json(withUrls);
        } catch (err) {
            console.error("Error en getAll notas:", err);
            res.status(500).json({ error: "Error obteniendo notas" });
        }
    }

    async create(req, res) {
        const idusuario = req.user.id;
        const { titulo, contenido } = req.body;

        const eventosBody = normalizeEventos(req.body["eventos[]"] ?? req.body.eventos);

        const { success, error: validationError, value: safeBody } = validateNota({ titulo, contenido });
        if (!success) return res.status(400).json({ error: validationError.message });

        let eventos;
        try {
            const { filtered, rejected } = await filterOwnedEvents(eventosBody, idusuario);
            if (rejected.length > 0) {
                return res.status(400).json({ error: "Algunas citas no pertenecen al usuario autenticado" });
            }
            eventos = filtered;
        } catch (err) {
            console.error("❌ Error validando eventos vinculados:", err);
            return res.status(500).json({ error: "No se pudieron validar las citas vinculadas" });
        }

        const slugBase = slugify(safeBody.titulo).slice(0, 50) || `nota-${Date.now()}`;

        let notaDB;
        try {
            notaDB = await NotasModel.create({ input: { ...safeBody, idusuario, eventos } });
        } catch (err) {
            console.error("❌ DB create nota error:", err);
            return res.status(500).json({ error: "Error creando nota en DB" });
        }

        const slug = `${slugBase}-${notaDB.id}`;
        const remoteDir = path.posix.join(buildRemoteBase({ ...notaDB, idusuario }), slug);

        const imagenes = [];
        const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);

        if (!ftpReady) {
            console.warn("⚠️  ENV FTP/IMG incompletas; salto subida FTP y devuelvo nota sin imágenes.");
            try {
                const updated = await NotasModel.update({
                    id: notaDB.id,
                    input: { imagenes: [], fechaactualizado: new Date() },
                });
                return res.status(201).json({ ...updated, imagenes: [] });
            } catch (err) {
                console.error("❌ DB update tras fallback FTP:", err);
                return res.status(201).json({ ...notaDB, imagenes: [] });
            }
        }

        try {
            await withFtp(async (client) => {
                if (!req.files?.length) return; // ✅ NO FTP si no hay imágenes

                await client.ensureDir(remoteDir);
                for (const file of req.files) {
                    const dest = path.posix.join(remoteDir, file.originalname);
                    await client.uploadFrom(Readable.from(file.buffer), dest);
                    imagenes.push(file.originalname);
                }
            });
        } catch (err) {
            console.error("❌ FTP upload error:", err);
            try {
                const updated = await NotasModel.update({
                    id: notaDB.id,
                    input: { imagenes: [], fechaactualizado: new Date() },
                });
                return res.status(201).json({ ...updated, imagenes: [] });
            } catch (err2) {
                console.error("❌ DB update tras error FTP:", err2);
                return res.status(201).json({ ...notaDB, imagenes: [] });
            }
        }

        try {
            const updated = await NotasModel.update({
                id: notaDB.id,
                input: { imagenes, fechaactualizado: new Date() },
            });

            const baseDir = buildRemoteBase({ ...notaDB, idusuario });
            const relPath = `${baseDir.replace(/^\/+/, "")}/${slug}`;
            const base = IMG_BASE_URL.replace(/\/$/, "");
            const fullUrls = imagenes.map((name) => `${base}/${relPath}/${encodeURIComponent(name)}`);

            return res.status(201).json({ ...updated, imagenes: fullUrls });
        } catch (err) {
            console.error("❌ DB update con imágenes error:", err);
            return res.status(201).json({ ...notaDB, imagenes: [] });
        }
    }

    async update(req, res) {
        const requesterId = req.user.id;
        const id = Number(req.params.id);
        const { titulo, contenido } = req.body;

        const eventosBody = normalizeEventos(req.body["eventos[]"] ?? req.body.eventos);

        const keepList = req.body.keep_imagenes || req.body["keep_imagenes[]"] || [];
        const removedList = req.body.removed_images || req.body["removed_images[]"] || [];
        const keepArrayRaw = Array.isArray(keepList) ? keepList : [keepList].filter(Boolean);
        const removedArray = Array.isArray(removedList) ? removedList : [removedList].filter(Boolean);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });
            if (nota.idusuario !== requesterId) return res.status(403).json({ error: "Prohibido" });

            const { success, error: validationError, value: safeBody } = validatePartialNota({ titulo, contenido });
            if (!success) return res.status(400).json({ error: validationError.message });

            let eventos;
            try {
                const { filtered, rejected } = await filterOwnedEvents(eventosBody, requesterId);
                if (rejected.length > 0) {
                    return res.status(400).json({ error: "Alguna de las citas vinculadas no pertenece a tu usuario" });
                }
                eventos = filtered;
            } catch (err) {
                console.error("❌ Error validando eventos vinculados (update):", err);
                return res.status(500).json({ error: "No se pudieron validar las citas vinculadas" });
            }

            const currentNames = Array.isArray(nota.imagenes) ? nota.imagenes : [];
            let keepArray;

            if (keepArrayRaw.length > 0) {
                const currentSet = new Set(currentNames);
                keepArray = keepArrayRaw.filter((name) => currentSet.has(name));
            } else if (removedArray.length > 0) {
                const removedSet = new Set(removedArray);
                keepArray = currentNames.filter((name) => !removedSet.has(name));
            } else {
                keepArray = currentNames;
            }

            const nuevas = [];
            const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);

            const remoteDir = ftpReady
                ? await withFtp((client) => resolveNoteFolder(client, { ...nota, id }))
                : path.posix.join(buildRemoteBase({ ...nota, id }), buildExpectedFolderName({ ...nota, id }));

            const incomingFiles = Array.isArray(req.files) ? req.files.length : 0;
            if (keepArray.length + incomingFiles > 3) {
                return res.status(400).json({ error: "Máximo 3 imágenes por nota" });
            }

            if (ftpReady) {
                try {
                    await withFtp(async (client) => {
                        const shouldTouchFtp =
                            (req.files?.length || 0) > 0 || removedArray.length > 0 || keepArrayRaw.length > 0;

                        if (!shouldTouchFtp) return;

                        await client.ensureDir(remoteDir);

                        const archivos = await client.list(remoteDir).catch(() => []);
                        const eliminar = archivos.filter((f) => !f.isDirectory && !keepArray.includes(f.name));
                        for (const f of eliminar) {
                            await client.remove(path.posix.join(remoteDir, f.name));
                        }

                        if (req.files?.length) {
                            for (const file of req.files) {
                                const dest = path.posix.join(remoteDir, file.originalname);
                                await client.uploadFrom(Readable.from(file.buffer), dest);
                                nuevas.push(file.originalname);
                            }
                        }
                    });
                } catch (ftpErr) {
                    console.error("❌ FTP update error:", ftpErr);
                }
            } else {
                console.warn("⚠️  ENV FTP/IMG incompletas; salto operaciones FTP (update).");
            }

            const imagenes = [...keepArray, ...nuevas].filter(Boolean);

            const inputUpdate = { fechaactualizado: new Date(), imagenes, eventos };
            if (typeof safeBody.titulo === "string") inputUpdate.titulo = safeBody.titulo;
            if (typeof safeBody.contenido === "string") inputUpdate.contenido = safeBody.contenido;

            const actualizado = await NotasModel.update({ id, input: inputUpdate });

            const base = IMG_BASE_URL.replace(/\/$/, "");
            const baseDir = buildRemoteBase({ ...nota, id }).replace(/^\/+/, "");
            const folderName = path.posix.basename(remoteDir);
            const relPath = `${baseDir}/${folderName}`;
            const fullUrls = imagenes.map((name) => `${base}/${relPath}/${encodeURIComponent(name)}`);

            return res.json({ ...actualizado, imagenes: fullUrls });
        } catch (err) {
            console.error("Error actualizando nota:", err);
            res.status(500).json({ error: "Error actualizando nota" });
        }
    }

    async delete(req, res) {
        const requesterId = req.user.id;
        const id = Number(req.params.id);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });
            if (nota.idusuario !== requesterId) return res.status(403).json({ error: "Prohibido" });

            const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);

            if (ftpReady) {
                try {
                    await withFtp(async (client) => {
                        const resolved = await resolveNoteFolder(client, { ...nota, id });

                        const parent = path.posix.dirname(resolved);
                        const folder = path.posix.basename(resolved);

                        const dirs = await client.list(parent).catch(() => []);
                        const target = dirs.find((item) => item.isDirectory && item.name === folder);

                        if (target) {
                            await client.removeDir(resolved);
                        } else {
                            // silencio (no es error)
                        }
                    });
                } catch (ftpErr) {
                    console.error("❌ FTP delete error:", ftpErr);
                }
            }

            await NotasModel.delete({ id });
            res.status(204).end();
        } catch (err) {
            console.error("Error eliminando nota:", err);
            res.status(500).json({ error: "Error eliminando nota" });
        }
    }
}
