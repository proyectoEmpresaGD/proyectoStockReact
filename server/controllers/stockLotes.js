import { StockLotesModel } from '../models/Postgres/stockLotes.js';
import { validateStockPorLotes, validatePartialStockPorLotes } from '../schemas/stockLotes.js';

export class StockLotesController {
    async getAll(req, res) {
        try {
            const { canal } = req.query;
            const stocks = await StockLotesModel.getAll({ canal });
            res.json(stocks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { codProdu } = req.params;
            const stock = await StockLotesModel.getById({ codProdu });
            if (stock) {
                res.json(stock);
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByCodProdu(req, res) {
        try {
            const { codProdu } = req.params;
            const stockLotes = await StockLotesModel.getByCodProdu({ codProdu });
            if (stockLotes) {
                res.json(stockLotes);
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateStockPorLotes(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const newStock = await StockLotesModel.create({ input: req.body });
            res.status(201).json(newStock);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { codProdu } = req.params;
            const validationResult = validatePartialStockPorLotes(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const updatedStock = await StockLotesModel.update({ codProdu, input: req.body });
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
            const { codProdu } = req.params;
            const result = await StockLotesModel.delete({ codProdu });
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