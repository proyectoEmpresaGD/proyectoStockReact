import { ImagenModel } from '../models/Postgres/imagenes.js';
import { validateImagen, validatePartialImagen } from '../schemas/imagenes.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const IMAGES_DIR = path.resolve('C:/imagenes');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
export class ImagenController {

    async getAll(req, res) {
        try {
            const { empresa, ejercicio, limit, page } = req.query;
            const limitParsed = parseInt(limit, 10) || 10;
            const pageParsed = parseInt(page, 10) || 1;
            const offset = (pageParsed - 1) * limitParsed;
            const images = await ImagenModel.getAll({ empresa, ejercicio, limit: limitParsed, offset });
            res.json(images);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async descargarImagenes(req, res) {
        try {
            const imagenes = await ImagenModel.getImagenesBuena(); // necesitas definir esto si no lo tienes

            let descargadas = 0;

            for (const { codprodu, ficadjunto } of imagenes) {
                if (!ficadjunto?.trim()) continue;

                const normalizedUrl = ficadjunto.startsWith('http') ? ficadjunto : `https://${ficadjunto}`;
                const encodedUrl = encodeURI(normalizedUrl);
                const extension = ficadjunto.toLowerCase().includes('.png') ? 'png' : 'jpg';
                const filename = `${codprodu}.${extension}`;
                const filepath = path.join(IMAGES_DIR, filename);

                if (fs.existsSync(filepath)) {
                    await ImagenModel.actualizarRutaImagenExcel(codprodu, filepath);
                    continue;
                }

                try {
                    const response = await axios.get(encodedUrl, {
                        responseType: 'arraybuffer',
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });

                    fs.writeFileSync(filepath, response.data);
                    await ImagenModel.actualizarRutaImagenExcel(codprodu, filepath);
                    descargadas++;
                } catch (err) {
                    console.error(`❌ Error al descargar ${codprodu}: ${err.message}`);
                }
            }

            res.json({ message: `Proceso terminado. Imágenes nuevas: ${descargadas}` });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al descargar imágenes' });
        }
    }

    async getById(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;
            const image = await ImagenModel.getById({ codprodu, codclaarchivo });
            if (image) {
                res.json(image);
            } else {
                res.status(404).json({ message: 'Image not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPublicImage(req, res) {
        const { codprodu } = req.params;

        try {
            const { rows } = await pool.query(`
      SELECT ficadjunto
      FROM imagenesocproductos
      WHERE codprodu = $1 AND LOWER(codclaarchivo) = 'buena'
      LIMIT 1
    `, [codprodu]);

            if (rows.length === 0 || !rows[0].ficadjunto) {
                console.warn(`❌ Imagen no encontrada en DB para codprodu: ${codprodu}`);
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }

            const remoteUrl = rows[0].ficadjunto;
            console.log(`🌐 Descargando imagen desde: ${remoteUrl}`);

            const response = await axios.get(remoteUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*'
                }
            });

            const contentType = response.headers['content-type'] || '';
            const size = response.data?.length || 0;

            if (!contentType.startsWith('image/') || size < 2000) {
                console.warn(`⚠️ Contenido no válido para ${codprodu} → tipo: ${contentType}, tamaño: ${size} bytes`);
                return res.status(415).json({ error: 'Contenido no válido para imagen' });
            }

            res.setHeader('Content-Type', contentType);
            res.send(response.data);

        } catch (err) {
            console.error(`❌ Error al obtener imagen para ${codprodu}:`, err.message);
            res.status(500).json({ error: 'Error interno al obtener imagen' });
        }
    }

    async getByCodproduAndCodclaarchivo(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;
            const image = await ImagenModel.getByCodproduAndCodclaarchivo({ codprodu, codclaarchivo });
            if (image) {
                res.json(image);
            } else {
                res.status(404).json({ message: 'Image not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateImagen(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const newImage = await ImagenModel.create({ input: req.body });
            res.status(201).json(newImage);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;
            const validationResult = validatePartialImagen(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const updatedImage = await ImagenModel.update({ codprodu, codclaarchivo, input: req.body });
            if (updatedImage) {
                res.json(updatedImage);
            } else {
                res.status(404).json({ message: 'Image not found' });
            }
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;
            const result = await ImagenModel.delete({ codprodu, codclaarchivo });
            if (result) {
                res.json({ message: 'Image deleted' });
            } else {
                res.status(404).json({ message: 'Image not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
