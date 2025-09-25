// server/controllers/notas.js
import { Client } from "basic-ftp";
import path from "path";
import { Readable } from "stream";
import slugifyLib from "slugify";
import { NotasModel } from "../models/Postgres/notas.js";

const FTP_BASE = process.env.FTP_BASE_PATH;     // ej: /CALENDARIO
const IMG_BASE_URL = process.env.IMG_BASE_URL;  // ej: https://bassari.eu/CALENDARIO

function slugify(text) {
    return slugifyLib(text, { lower: true, strict: true });
}

async function withFtp(fn) {
    const client = new Client();
    await client.access({
        host: process.env.FTP_HOST, // accessproxy.webpod16-cph3.one.com
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
    // GET /api/notas
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

    // POST /api/notas
    async create(req, res) {
        const idusuario = req.user.id;
        const { titulo, contenido } = req.body;

        const eventos = Array.isArray(req.body["eventos[]"])
            ? req.body["eventos[]"]
            : Array.isArray(req.body.eventos)
                ? req.body.eventos
                : req.body.eventos
                    ? [req.body.eventos]
                    : [];

        if (!titulo?.trim() || !contenido?.trim()) {
            return res.status(400).json({ error: "Título y contenido obligatorios" });
        }

        const now = new Date();
        const slugBase = slugify(titulo).slice(0, 50) || `nota-${Date.now()}`;

        // 1) Crear en DB primero
        let notaDB;
        try {
            notaDB = await NotasModel.create({
                input: { titulo, contenido, idusuario, eventos },
            });
        } catch (err) {
            console.error("❌ DB create nota error:", err);
            return res.status(500).json({ error: "Error creando nota en DB" });
        }

        const slug = `${slugBase}-${notaDB.id}`;
        const yyyy = now.getFullYear().toString();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");

        const remoteDir = path.posix.join(
            FTP_BASE || "/",
            idusuario.toString(),
            "NOTAS",
            yyyy, mm, dd,
            slug
        );

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

        // 2) Subir a FTP
        try {
            await withFtp(async (client) => {
                await client.ensureDir(remoteDir);
                if (req.files?.length) {
                    for (const file of req.files) {
                        const dest = path.posix.join(remoteDir, file.originalname);
                        await client.uploadFrom(Readable.from(file.buffer), dest);
                        imagenes.push(file.originalname);
                    }
                }
            });
        } catch (err) {
            console.error("❌ FTP upload error:", err);
            // No devolvemos 500: creamos sin imágenes
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

        // 3) Actualizar DB con nombres y responder con URLs públicas
        try {
            const updated = await NotasModel.update({
                id: notaDB.id,
                input: { imagenes, fechaactualizado: new Date() },
            });

            const relPath = `${idusuario}/NOTAS/${yyyy}/${mm}/${dd}/${slug}`;
            const base = IMG_BASE_URL.replace(/\/$/, "");
            const fullUrls = imagenes.map(
                (name) => `${base}/${relPath}/${encodeURIComponent(name)}`
            );

            return res.status(201).json({ ...updated, imagenes: fullUrls });
        } catch (err) {
            console.error("❌ DB update con imágenes error:", err);
            return res.status(201).json({ ...notaDB, imagenes: [] });
        }
    }

    // PATCH /api/notas/:id
    async update(req, res) {
        const requesterId = req.user.id;
        const id = Number(req.params.id);
        const { titulo, contenido } = req.body;

        const eventos = Array.isArray(req.body["eventos[]"])
            ? req.body["eventos[]"]
            : Array.isArray(req.body.eventos)
                ? req.body.eventos
                : req.body.eventos
                    ? [req.body.eventos]
                    : [];

        const keepList = req.body.keep_imagenes || req.body["keep_imagenes[]"] || [];
        const removedList = req.body.removed_images || req.body["removed_images[]"] || [];
        const keepArrayRaw = Array.isArray(keepList) ? keepList : [keepList].filter(Boolean);
        const removedArray = Array.isArray(removedList) ? removedList : [removedList].filter(Boolean);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });
            if (nota.idusuario !== requesterId) {
                return res.status(403).json({ error: "Prohibido" });
            }

            const fecha = new Date(nota.fechacreado);
            const yyyy = fecha.getFullYear().toString();
            const mm = String(fecha.getMonth() + 1).padStart(2, "0");
            const dd = String(fecha.getDate()).padStart(2, "0");
            const slug = slugify(nota.titulo).slice(0, 50) + "-" + id;

            const remoteDir = path.posix.join(
                FTP_BASE || "/",
                String(nota.idusuario),
                "NOTAS",
                yyyy, mm, dd,
                slug
            );

            // 👇 Mantener imágenes de forma segura
            const currentNames = Array.isArray(nota.imagenes) ? nota.imagenes : [];
            let keepArray;
            if (keepArrayRaw.length > 0) {
                keepArray = keepArrayRaw;
            } else if (removedArray.length > 0) {
                const removedSet = new Set(removedArray);
                keepArray = currentNames.filter((name) => !removedSet.has(name));
            } else {
                // Si no vino nada, por defecto conservamos las actuales
                keepArray = currentNames;
            }

            const nuevas = [];
            const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);

            if (ftpReady) {
                try {
                    await withFtp(async (client) => {
                        await client.ensureDir(remoteDir);
                        const archivos = await client.list(remoteDir).catch(() => []);
                        const eliminar = archivos.filter(
                            (f) => !f.isDirectory && !keepArray.includes(f.name)
                        );
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
                    // Seguimos sin tumbar la actualización: solo no habrá nuevas imágenes subidas
                }
            } else {
                console.warn("⚠️  ENV FTP/IMG incompletas; salto operaciones FTP (update).");
            }

            const imagenes = [...keepArray, ...nuevas].filter(Boolean);

            // Construimos input solo con campos definidos para no sobreescribir con undefined
            const inputUpdate = { fechaactualizado: new Date(), imagenes, eventos };
            if (typeof titulo === "string") inputUpdate.titulo = titulo;
            if (typeof contenido === "string") inputUpdate.contenido = contenido;

            const actualizado = await NotasModel.update({
                id,
                input: inputUpdate,
            });

            const relPath = `${nota.idusuario}/NOTAS/${yyyy}/${mm}/${dd}/${slug}`;
            const base = IMG_BASE_URL.replace(/\/$/, "");
            const fullUrls = imagenes.map(
                (name) => `${base}/${relPath}/${encodeURIComponent(name)}`
            );

            return res.json({ ...actualizado, imagenes: fullUrls });
        } catch (err) {
            console.error("Error actualizando nota:", err);
            res.status(500).json({ error: "Error actualizando nota" });
        }
    }

    // DELETE /api/notas/:id
    async delete(req, res) {
        const requesterId = req.user.id;
        const id = Number(req.params.id);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });
            if (nota.idusuario !== requesterId) {
                return res.status(403).json({ error: "Prohibido" });
            }

            const fecha = new Date(nota.fechacreado);
            const yyyy = fecha.getFullYear().toString();
            const mm = String(fecha.getMonth() + 1).padStart(2, "0");
            const dd = String(fecha.getDate()).padStart(2, "0");
            const slug = slugify(nota.titulo).slice(0, 50) + "-" + id;

            const remoteDir = path.posix.join(
                FTP_BASE || "/",
                String(nota.idusuario),
                "NOTAS",
                yyyy, mm, dd,
                slug
            );

            const ftpReady = Boolean(process.env.FTP_HOST && FTP_BASE && IMG_BASE_URL);
            if (ftpReady) {
                try {
                    await withFtp(async (client) => {
                        await client.removeDir(remoteDir);
                    });
                } catch (ftpErr) {
                    console.error("❌ FTP delete error:", ftpErr);
                    // No tumbamos el borrado por fallo de FTP
                }
            } else {
                console.warn("⚠️  ENV FTP/IMG incompletas; salto borrado FTP (delete).");
            }

            await NotasModel.delete({ id });
            res.status(204).end();
        } catch (err) {
            console.error("Error eliminando nota:", err);
            res.status(500).json({ error: "Error eliminando nota" });
        }
    }
}
