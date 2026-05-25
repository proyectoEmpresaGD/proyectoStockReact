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

    async getControlStockFilters(req, res) {
        try {
            const filters = await StockModel.getControlStockFilters();
            res.json(filters);
        } catch (error) {
            console.error('Error fetching control stock filters:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getControlStock(req, res) {
        try {
            const { provider = '', collection = '', productName = '', monthsBack = 12, limit = 500 } = req.query;

            const data = await StockModel.getControlStock({
                provider,
                collection,
                productName,
                monthsBack,
                limit,
            });

            res.json(data);
        } catch (error) {
            console.error('Error fetching control stock:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // ✅ NUEVO: /api/stock/fechas?codes=ARE01299,FLA0001...
    // dentro de StockController
    async getFechas(req, res) {
        try {
            const raw = String(req.query.codes || '').trim();
            const codes = raw.split(',').map((x) => x.trim()).filter(Boolean);

            if (!codes.length) {
                return res.json({});
            }

            const map = await StockModel.getFechaEstimadaMapByCodesFast(codes);
            const out = {};
            for (const c of codes) out[c] = map.get(c) || null;

            res.json(out);
        } catch (error) {
            console.error('Error in /api/stock/fechas:', error?.message || error);
            // endpoint complementario: nunca romper la pantalla por fechas
            return res.json({});
        }
    }



    async getById(req, res) {
        try {
            const { codprodu } = req.params;
            const stock = await StockModel.getById({ codprodu });
            if (stock) res.json(stock);
            else res.status(404).json({ message: 'Stock not found' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByCodprodu(req, res) {
        try {
            const { codprodu } = req.params;
            const stock = await StockModel.getByCodprodu({ codprodu });
            if (stock) res.json(stock);
            else res.status(404).json({ message: 'Stock not found' });
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
            if (updatedStock) res.json(updatedStock);
            else res.status(404).json({ message: 'Stock not found' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codprodu } = req.params;
            const result = await StockModel.delete({ codprodu });
            if (result) res.json({ message: 'Stock deleted' });
            else res.status(404).json({ message: 'Stock not found' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getEntradas(req, res) {
        try {
            const { date } = req.query;
            const dateValue = date || new Date().toISOString().split('T')[0];
            const entradas = await StockModel.getEntradasByDate({ date: dateValue });
            res.json(entradas);
        } catch (error) {
            console.error('Error fetching entradas:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getLowStockAlerts(req, res) {
        try {
            const days = Number(req.query.days || 90);
            const leadDays = Number(req.query.leadDays || 60);

            const { telas, libros, perchas } = await StockModel.getLowStockAlertsFiltered({
                days,
                leadDays,
            });

            res.json({ telas, libros, perchas });
        } catch (error) {
            console.error('Error fetching low stock alerts:', error);
            res.status(500).json({ error: error.message });
        }
    }
}
