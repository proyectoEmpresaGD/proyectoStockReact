import { ImagenModel } from '../models/Postgres/imagenes.js';
import { validateImagen, validatePartialImagen } from '../schemas/imagenes.js';

export class ImagenController {
    async getAll(req, res) {
        try {
            const { empresa, ejercicio, limit, page } = req.query;
            const limitParsed = parseInt(limit, 10) || 10;
            const pageParsed = parseInt(page, 10) || 1;
            const offset = (pageParsed - 1) * limitParsed;

            const images = await ImagenModel.getAll({
                empresa,
                ejercicio: ejercicio !== undefined ? Number(ejercicio) : undefined,
                limit: limitParsed,
                offset,
            });

            res.json(images);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;
            const image = await ImagenModel.getById({ codprodu, codclaarchivo });

            if (image) return res.json(image);

            return res.status(404).json({ message: 'Image not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // ✅ NUEVO: necesario para /producto/:codprodu
    async getByCodprodu(req, res) {
        try {
            const { codprodu } = req.params;

            const images = await ImagenModel.getByCodprodu({ codprodu });

            if (!images || images.length === 0) {
                return res.status(404).json({ message: 'No images found for product' });
            }

            return res.json(images);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // ✅ NUEVO: /:codprodu/:codclaarchivo/latest
    async getLatestByCodproduAndCodclaarchivo(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;

            const image = await ImagenModel.getLatestByCodproduAndCodclaarchivo({ codprodu, codclaarchivo });

            if (image) return res.json(image);

            return res.status(404).json({ message: 'Image not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }


    async getByCodproduAndCodclaarchivo(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;

            const image = await ImagenModel.getByCodproduAndCodclaarchivo({ codprodu, codclaarchivo });

            if (image) return res.json(image);

            return res.status(404).json({ message: 'Image not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateImagen(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }

            const newImage = await ImagenModel.create({ input: req.body });
            return res.status(201).json(newImage);
        } catch (error) {
            return res.status(400).json({ error: error.message });
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

            if (updatedImage) return res.json(updatedImage);

            return res.status(404).json({ message: 'Image not found' });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codprodu, codclaarchivo } = req.params;

            const result = await ImagenModel.delete({ codprodu, codclaarchivo });

            if (result) return res.json({ message: 'Image deleted' });

            return res.status(404).json({ message: 'Image not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}
