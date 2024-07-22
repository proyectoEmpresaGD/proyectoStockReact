import { FichajeModel } from '../models/fichaje.js';

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
            const { userId, tipo, timestamp } = req.body;
            if (!userId || !tipo || !timestamp) {
                return res.status(400).json({ error: 'All fields are required' });
            }
            const newFichaje = await FichajeModel.create({ userId, tipo, timestamp });
            res.status(201).json(newFichaje);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
