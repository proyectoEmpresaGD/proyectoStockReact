import { ImagenModel } from '../models/Postgres/imagenes.js';
import { validateImagen, validatePartialImagen } from '../schemas/imagenes.js';

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
