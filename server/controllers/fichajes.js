import { FichajeModel } from '../models/Postgres/fichajes.js';

export class FichajeController {
    async getAll(req, res) {
        try {
            const { userId } = req.query;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }
            const fichajes = await FichajeModel.getAllByUserId(userId);
            res.json(fichajes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const { userId, tipo, timestamp, firma } = req.body;
            if (!userId || !tipo || !timestamp) {
                return res.status(400).json({ error: 'userId, tipo, and timestamp are required' });
            }

            const date = new Date(timestamp);
            const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString();

            const existingFichaje = await FichajeModel.getByUserAndDate(userId, startOfDay, endOfDay, tipo);
            if (existingFichaje) {
                return res.status(400).json({ error: `A ${tipo} record already exists for today.` });
            }

            const newFichaje = await FichajeModel.create({ userId, tipo, timestamp, firma });
            res.status(201).json(newFichaje);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateFirma(req, res) {
        try {
            const { id } = req.params;
            const { firma } = req.body;
            if (!firma) {
                return res.status(400).json({ error: 'firma is required' });
            }
            const updatedFichaje = await FichajeModel.updateFirma(id, firma);
            res.json(updatedFichaje);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
