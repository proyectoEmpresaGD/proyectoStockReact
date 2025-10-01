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
            const lotes = await StockLotesModel.getById({ codProdu });
            res.json(lotes); // <- también array
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByCodProdu(req, res) {
        try {
            const codProdu = (req.params.codProdu || '').toString().trim().toUpperCase();

            // Solo 00 por defecto; si envías ?alm=0,0,17... respetamos lo que venga
            const almParam = (req.query.alm ?? '').toString().trim();
            const almacenes = almParam
                ? almParam.split(',').map(n => parseInt(n, 10)).filter(Number.isFinite)
                : [0];

            const lotes = await StockLotesModel.getByCodProdu({ codProdu, almacenes });
            return res.json(lotes); // array (posiblemente vacío)
        } catch (error) {
            console.error('getByCodProdu error:', error);
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
            const codProdu = (req.params.codProdu || '').trim();
            const validationResult = validatePartialStockPorLotes(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const updatedStock = await StockLotesModel.update({ codProdu, input: req.body });
            if (updatedStock) res.json(updatedStock);
            else res.status(404).json({ message: 'Stock not found' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const codProdu = (req.params.codProdu || '').trim();
            const result = await StockLotesModel.delete({ codProdu });
            if (result) res.json({ message: 'Stock deleted' });
            else res.status(404).json({ message: 'Stock not found' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
