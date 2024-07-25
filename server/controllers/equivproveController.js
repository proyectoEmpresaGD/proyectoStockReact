// controllers/equivproveController.js
import { EquivproveModel } from '../models/Postgres/EquivProveModel.js';

export class EquivproveController {
    static async getAll(req, res) {
        try {
            const { limit, offset } = req.query;
            const limitParsed = parseInt(limit, 10) || 20;
            const offsetParsed = parseInt(offset, 10) || 0;
            const data = await EquivproveModel.getAll({ limit: limitParsed, offset: offsetParsed });
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async search(req, res) {
        try {
            const { query, limit } = req.query;
            const limitParsed = parseInt(limit, 10) || 4;
            const data = await EquivproveModel.search({ query, limit: limitParsed });
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async searchCJMW(req, res) {
        try {
            const { query, limit } = req.query;
            const limitParsed = parseInt(limit, 10) || 4;
            const data = await EquivproveModel.searchCJMW({ query, limit: limitParsed });
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
