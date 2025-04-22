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

    static async search(req, res) {
        const { query, limit = 4 } = req.query;

        try {
            const searchQuery = `
            SELECT * FROM clientes
            WHERE "razclien" ILIKE $1
            LIMIT $2;
          `;
            const values = [`%${query}%`, limit];
            const { rows } = await pool.query(searchQuery, values);
            res.status(200).json(rows);
        } catch (error) {
            console.error('Error searching clients:', error);
            res.status(500).json({ error: 'Error searching clients' });
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

    // controllers/stock.js
    // controllers/stock.js

    // controllers/stock.js
    async getLowStockAlerts(req, res) {
        try {
            const all = await StockModel.getLowStockAlerts();

            // Expresiones regulares y configuraciones
            const reExcludeTela = /LIBRO|QUALITY|TAPILLA|PERCHA|CUTTING(?:S)?|RIEL/i;
            const reLibro = /LIBRO/i;
            const rePercha = /PERCHA/i;
            const marcasTela = /^(CJM|HAR|BAS|ARE|FLA)/i;
            const colecciones = [
                'stratos', 'diamante', 'urban contemporary',
                'revoltoso vol i', 'revoltoso vol ii'
            ];

            const lowTelas = all.filter(item => {
                const des = String(item.desprodu || '');
                const codp = String(item.codprodu || '');
                const cole = String(item.coleccion || '').toLowerCase();

                return (
                    parseFloat(item.stockactual) < 30 &&
                    marcasTela.test(codp) &&
                    !reExcludeTela.test(des) &&
                    // si colecciones definidas, filtrar por ellas:
                    (colecciones.length === 0 || colecciones.includes(cole))
                );
            });

            const lowLibros = all.filter(item =>
                parseFloat(item.stockactual) < 30 &&
                reLibro.test(item.desprodu)
            );

            const lowPerchas = all.filter(item =>
                parseFloat(item.stockactual) < 10 &&
                rePercha.test(item.desprodu)
            );

            res.json({ telas: lowTelas, libros: lowLibros, perchas: lowPerchas });
        } catch (error) {
            console.error("Error fetching low stock alerts:", error);
            res.status(500).json({ error: error.message });
        }
    }



}