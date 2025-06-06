// server/controllers/notas.js
import { Client } from "basic-ftp";
import path from "path";
import { Readable } from "stream";
import slugifyLib from "slugify";
import { NotasModel } from "../models/Postgres/notas.js";

const FTP_BASE = process.env.FTP_BASE_PATH;
const IMG_BASE_URL = process.env.IMG_BASE_URL;

function slugify(text) {
    return slugifyLib(text, { lower: true, strict: true });
}

async function withFtp(fn) {
    const client = new Client();
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
            const notas = await NotasModel.getAll({ offset: 0, limit: 100, query: null });
            const withUrls = notas.map((n) => {
                const fecha = new Date(n.fechacreado);
                const slug = slugify(n.titulo).slice(0, 50) + "-" + n.id;
                const relPath = `${idusuario}/NOTAS/${fecha.getFullYear()}/${String(fecha.getMonth() + 1).padStart(2, "0")}/${String(fecha.getDate()).padStart(2, "0")}/${slug}`;
                const baseUrl = IMG_BASE_URL.replace(/\/$/, "");
                const imagenes = (n.imagenes || []).map((name) => `${baseUrl}/${relPath}/${encodeURIComponent(name)}`);
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
        const { titulo, contenido, eventos = [] } = req.body;
        if (!titulo?.trim() || !contenido?.trim()) {
            return res.status(400).json({ error: "Título y contenido obligatorios" });
        }

        const now = new Date();
        const slugBase = slugify(titulo).slice(0, 50) || `nota-${Date.now()}`;

        const notaDB = await NotasModel.create({
            input: { titulo, contenido, idusuario, eventos },
        });

        const slug = `${slugBase}-${notaDB.id}`;
        const remoteDir = path.posix.join(
            FTP_BASE,
            idusuario.toString(),
            "NOTAS",
            now.getFullYear().toString(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
            slug
        );

        const imagenes = [];

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

            const updated = await NotasModel.update({
                id: notaDB.id,
                input: { imagenes, fechaactualizado: new Date() },
            });

            const relPath = `${idusuario}/NOTAS/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${slug}`;
            const fullUrls = imagenes.map((name) => `${IMG_BASE_URL.replace(/\/$/, "")}/${relPath}/${encodeURIComponent(name)}`);

            return res.status(201).json({ ...updated, imagenes: fullUrls });
        } catch (err) {
            console.error("Error creando nota:", err);
            return res.status(500).json({ error: "Error creando nota" });
        }
    }

    async update(req, res) {
        const idusuario = req.user.id;
        const id = Number(req.params.id);
        const { titulo, contenido, eventos = [] } = req.body;

        const keepList = req.body.keep_imagenes || req.body["keep_imagenes[]"] || [];
        const keepArray = Array.isArray(keepList) ? keepList : [keepList].filter(Boolean);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });

            const slug = slugify(nota.titulo).slice(0, 50) + "-" + id;
            const fecha = new Date(nota.fechacreado);
            const remoteDir = path.posix.join(
                FTP_BASE,
                idusuario.toString(),
                "NOTAS",
                fecha.getFullYear().toString(),
                String(fecha.getMonth() + 1).padStart(2, "0"),
                String(fecha.getDate()).padStart(2, "0"),
                slug
            );

            const nuevas = [];

            await withFtp(async (client) => {
                const archivos = await client.list(remoteDir);
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

            const imagenes = [...keepArray, ...nuevas];
            const actualizado = await NotasModel.update({
                id,
                input: { titulo, contenido, eventos, imagenes, fechaactualizado: new Date() },
            });

            const relPath = `${idusuario}/NOTAS/${fecha.getFullYear()}/${String(fecha.getMonth() + 1).padStart(2, "0")}/${String(fecha.getDate()).padStart(2, "0")}/${slug}`;
            const fullUrls = imagenes.map((name) => `${IMG_BASE_URL.replace(/\/$/, "")}/${relPath}/${encodeURIComponent(name)}`);

            return res.json({ ...actualizado, imagenes: fullUrls });
        } catch (err) {
            console.error("Error actualizando nota:", err);
            res.status(500).json({ error: "Error actualizando nota" });
        }
    }

    async delete(req, res) {
        const idusuario = req.user.id;
        const id = Number(req.params.id);

        try {
            const nota = await NotasModel.getById({ id });
            if (!nota) return res.status(404).json({ error: "Nota no encontrada" });

            const slug = slugify(nota.titulo).slice(0, 50) + "-" + id;
            const fecha = new Date(nota.fechacreado);
            const remoteDir = path.posix.join(
                FTP_BASE,
                idusuario.toString(),
                "NOTAS",
                fecha.getFullYear().toString(),
                String(fecha.getMonth() + 1).padStart(2, "0"),
                String(fecha.getDate()).padStart(2, "0"),
                slug
            );

            await withFtp(async (client) => {
                await client.removeDir(remoteDir);
            });

            await NotasModel.delete({ id });
            res.status(204).end();
        } catch (err) {
            console.error("Error eliminando nota:", err);
            res.status(500).json({ error: "Error eliminando nota" });
        }
    }
}
