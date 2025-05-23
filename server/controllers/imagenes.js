import { ImagenModel } from '../models/Postgres/imagenes.js';
import { validateImagen, validatePartialImagen } from '../schemas/imagenes.js';
import axios from 'axios';

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
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }

            const remoteUrl = rows[0].ficadjunto;
            console.log(`🌐 Descargando imagen desde: ${remoteUrl}`);

            const response = await axios.get(remoteUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
            console.error('❌ Error al obtener imagen:', err.message);
            res.status(500).json({ error: 'Error interno al obtener imagen' });
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
