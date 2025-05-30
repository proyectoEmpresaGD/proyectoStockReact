// server/controllers/notas.js
import { Client } from "basic-ftp";
import path from "path";
import { Readable, Writable } from "stream";
import slugifyLib from "slugify";

const FTP_BASE = process.env.FTP_BASE_PATH;
const IMG_BASE_URL = process.env.IMG_BASE_URL;

if (!FTP_BASE) throw new Error('Missing FTP_BASE_PATH env var');
if (!IMG_BASE_URL) throw new Error('Missing IMG_BASE_URL env var');

async function withFtp(fn) {
    const client = new Client();
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

function bufferFromJson(obj) {
    return Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
}

function slugify(text) {
    return slugifyLib(text, { lower: true, strict: true });
}

export class NotasController {
    async getAll(req, res) {
        const userId = String(req.user.id);
        const baseDir = path.posix.join(FTP_BASE, userId, 'NOTAS');
        const notas = [];

        try {
            await withFtp(async client => {
                async function walk(dir) {
                    for (const entry of await client.list(dir)) {
                        const full = path.posix.join(dir, entry.name);
                        if (entry.isDirectory) { await walk(full); continue; }
                        if (entry.name !== 'datos.json') continue;

                        const chunks = [];
                        const writer = new Writable({ write(chunk, enc, cb) { chunks.push(chunk); cb(); } });
                        await client.downloadTo(writer, full);
                        const nota = JSON.parse(Buffer.concat(chunks).toString('utf8'));

                        const folder = path.posix.dirname(full);
                        const items = await client.list(folder);

                        const rel = path.posix.relative(
                            path.posix.join(FTP_BASE, userId, 'NOTAS'),
                            folder
                        );

                        const baseUrl = IMG_BASE_URL.replace(/\/$/, '');
                        const imagenes = items
                            .filter(f => !f.isDirectory && f.name !== 'datos.json')
                            .map(f => `${baseUrl}/${userId}/NOTAS/${rel}/${encodeURIComponent(f.name)}`);

                        notas.push({ ...nota, imagenes });
                    }
                }
                await walk(baseDir);
            });
            return res.json(notas);
        } catch (err) {
            console.error('FTP getAll Notas error:', err);
            return res.status(500).json({ error: 'Error listando notas FTP' });
        }
    }

    async create(req, res) {
        const userId = String(req.user.id);
        const { titulo, contenido, eventos = [] } = req.body;
        if (!titulo?.trim() || !contenido?.trim()) {
            return res.status(400).json({ error: 'Título y contenido obligatorios' });
        }

        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const slugBase = slugify(titulo).slice(0, 50) || `nota-${Date.now()}`;
        const slug = `${slugBase}-${Date.now()}`;

        const remoteDir = path.posix.join(FTP_BASE, userId, 'NOTAS', year, month, day, slug);
        const nota = { id: Date.now(), titulo, contenido, eventos, creado_en: now.toISOString(), imagenes: [] };

        try {
            await withFtp(async client => {
                await client.ensureDir(remoteDir);
                await client.uploadFrom(
                    Readable.from(bufferFromJson(nota)),
                    path.posix.join(remoteDir, 'datos.json')
                );

                if (req.files?.length) {
                    for (const file of req.files) {
                        await client.uploadFrom(
                            Readable.from(file.buffer),
                            path.posix.join(remoteDir, file.originalname)
                        );
                        nota.imagenes.push(file.originalname);
                    }
                    await client.uploadFrom(
                        Readable.from(bufferFromJson(nota)),
                        path.posix.join(remoteDir, 'datos.json')
                    );
                }
            });
            return res.status(201).json(nota);
        } catch (err) {
            console.error('FTP create Notas error:', err);
            return res.status(500).json({ error: 'Error subiendo nota FTP' });
        }
    }
    async update(req, res) {
        const userId = String(req.user.id);
        const idToUpdate = String(req.params.id);
        const { titulo, contenido, eventos = [] } = req.body;

        if (!titulo?.trim() || !contenido?.trim()) {
            return res.status(400).json({ error: 'Título y contenido obligatorios' });
        }

        let found = null;
        let oldNota = null;

        try {
            await withFtp(async client => {
                async function walk(dir) {
                    for (const entry of await client.list(dir)) {
                        const full = path.posix.join(dir, entry.name);
                        if (entry.isDirectory) {
                            await walk(full);
                            continue;
                        }
                        if (entry.name !== 'datos.json') continue;

                        const buf = [];
                        const w = new Writable({ write(c, enc, cb) { buf.push(c); cb(); } });
                        await client.downloadTo(w, full);
                        const obj = JSON.parse(Buffer.concat(buf).toString('utf8'));

                        if (String(obj.id) === idToUpdate) {
                            found = path.posix.dirname(full);
                            oldNota = obj;
                            return;
                        }
                    }
                }

                await walk(path.posix.join(FTP_BASE, userId, 'NOTAS'));
            });

            if (!found || !oldNota) return res.status(404).json({ error: 'Nota no encontrada' });

            // CORREGIDO: recoger correctamente las imágenes a mantener
            const keepList = req.body.keep_imagenes || req.body['keep_imagenes[]'] || [];
            const keepArray = Array.isArray(keepList) ? keepList : [keepList].filter(Boolean);

            const updated = {
                ...oldNota,
                titulo,
                contenido,
                eventos,
                actualizado_en: new Date().toISOString(),
                imagenes: [...keepArray]
            };

            await withFtp(async client => {
                const folderFiles = await client.list(found);

                const toDelete = folderFiles
                    .filter(f => !f.isDirectory && f.name !== 'datos.json' && !keepArray.includes(f.name));

                for (const f of toDelete) {
                    try {
                        await client.remove(path.posix.join(found, f.name));
                    } catch (err) {
                        console.warn('No se pudo eliminar imagen:', f.name, err.message);
                    }
                }

                if (req.files?.length) {
                    for (const f of req.files) {
                        const dest = path.posix.join(found, f.originalname);
                        await client.uploadFrom(Readable.from(f.buffer), dest);
                        updated.imagenes.push(f.originalname);
                    }
                }

                await client.uploadFrom(
                    Readable.from(bufferFromJson(updated)),
                    path.posix.join(found, 'datos.json')
                );
            });

            const rel = path.posix.relative(path.posix.join(FTP_BASE, userId, 'NOTAS'), found);
            const baseUrl = IMG_BASE_URL.replace(/\/$/, '');
            const imagenesUrls = updated.imagenes.map(f =>
                `${baseUrl}/${userId}/NOTAS/${rel}/${encodeURIComponent(f)}`
            );

            return res.json({
                ...updated,
                imagenes: imagenesUrls
            });

        } catch (err) {
            console.error('FTP update Notas error:', err);
            return res.status(500).json({ error: 'Error actualizando nota FTP' });
        }
    }


    async delete(req, res) {
        const userId = String(req.user.id);
        const idDel = String(req.params.id);
        let deleted = false;

        try {
            await withFtp(async client => {
                async function walk(dir) {
                    for (const entry of await client.list(dir)) {
                        const full = path.posix.join(dir, entry.name);
                        if (deleted) return;
                        if (entry.isDirectory) { await walk(full); continue; }
                        if (entry.name === 'datos.json') {
                            const buf = [];
                            const w = new Writable({ write(c, enc, cb) { buf.push(c); cb(); } });
                            await client.downloadTo(w, full);
                            const obj = JSON.parse(Buffer.concat(buf).toString('utf8'));
                            if (String(obj.id) === idDel) {
                                await client.removeDir(path.posix.dirname(full));
                                deleted = true; return;
                            }
                        }
                    }
                }
                await walk(path.posix.join(FTP_BASE, userId, 'NOTAS'));
            });

            if (!deleted) return res.status(404).json({ error: 'Nota no encontrada' });
            return res.status(204).end();
        } catch (err) {
            console.error('FTP delete Notas error:', err);
            return res.status(500).json({ error: 'Error eliminando nota FTP' });
        }
    }
}