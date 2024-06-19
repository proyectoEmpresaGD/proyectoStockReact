import { StockModel } from '../models/Postgres/stock.js';
import { validateStock, validatePartialStock } from '../schemas/stock.js';

export class StockController {
    async getAll(req, res) {
        try {
            const { empresa, ejercicio } = req.query;
            const stocks = await StockModel.getAll({ empresa, ejercicio });
            res.json(stocks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    
    async getById(req, res) {
        try {
            const { codprodu } = req.params;
            const stock = await StockModel.getById({ codprodu });
            if (stock) {
                res.json(stock);
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByCodprodu(req, res) {
        try {
            const { codprodu } = req.params;
            const stock = await StockModel.getByCodprodu({ codprodu });
            if (stock) {
                res.json(stock);
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateStock(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const newStock = await StockModel.create({ input: req.body });
            res.status(201).json(newStock);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { codprodu } = req.params;
            const validationResult = validatePartialStock(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const updatedStock = await StockModel.update({ codprodu, input: req.body });
            if (updatedStock) {
                res.json(updatedStock);
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codprodu } = req.params;
            const result = await StockModel.delete({ codprodu });
            if (result) {
                res.json({ message: 'Stock deleted' });
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}