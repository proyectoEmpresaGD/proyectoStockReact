import { StockModel } from '../models/Postgres/stock.js';
import { ProductModel } from '../models/Postgres/productos.js';
import { StockLotesModel } from '../models/Postgres/stockLotes.js';
import { validateStock, validatePartialStock } from '../schemas/stock.js';
import { getRecepcionesCompraByDate, todayMadrid, validDate, RecepcionesNoConfiguradasError } from '../services/recepcionesCompra.js';

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

    async getClientProductStock(req, res) {
        const codes = req.body?.codes;
        if (!Array.isArray(codes) || codes.length > 1000
            || codes.some((code) => typeof code !== 'string' || !code.trim() || code.length > 100)) {
            return res.status(400).json({ message: 'Se admiten hasta 1000 códigos de producto válidos.' });
        }
        try {
            const stock = await StockModel.getAll({ codes });
            return res.json(stock);
        } catch (error) {
            console.error('Error consultando stock de clientes:', error);
            return res.status(500).json({ message: 'No se ha podido consultar el stock.' });
        }
    }

    async getControlStockFilters(req, res) {
        const startedAt = performance.now();
        try {
            const filters = await StockModel.getControlStockFilters();
            res.set('Server-Timing', `filters-db;dur=${(performance.now() - startedAt).toFixed(1)}`);
            res.json(filters);
        } catch (error) {
            console.error('Error fetching control stock filters:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async searchControlStockProducts(req, res) {
        try {
            const search = String(req.query.q ?? '').slice(0, 100);
            const suggestions = await StockModel.searchControlStockProducts(search);
            return res.json(suggestions);
        } catch (error) {
            console.error('Error buscando sugerencias de control de stock:', error);
            return res.status(500).json({ error: 'No se han podido cargar las sugerencias.' });
        }
    }

    async validateControlStockProducts(req, res) {
        const codes = req.body?.codes;
        if (!Array.isArray(codes) || codes.length > 2000
            || codes.some((code) => typeof code !== 'string' || !code.trim() || code.length > 100)) {
            return res.status(400).json({ error: 'Se requiere una lista de hasta 2000 códigos de producto válidos.' });
        }

        try {
            const activeCodes = await StockModel.getActiveControlStockProductCodes(codes);
            return res.json({ activeCodes });
        } catch (error) {
            console.error('Error validating stock purchase plan:', error);
            return res.status(500).json({ error: 'No se ha podido validar la propuesta de compra.' });
        }
    }

    async getControlStock(req, res) {
        const startedAt = performance.now();
        try {
            const { provider = '', collection = '', productName = '', productCode = '', monthsBack = 12, limit = 500 } = req.query;

            const data = await StockModel.getControlStock({
                provider,
                collection,
                productName,
                productCode,
                monthsBack,
                limit,
            });

            const elapsed = performance.now() - startedAt;
            res.set('Server-Timing', `stock-db;dur=${elapsed.toFixed(1)}`);
            if (elapsed > 3000) console.warn(`Control de stock: consulta lenta (${Math.round(elapsed)} ms, ${data.length} productos).`);
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

    // Consulta de solo lectura y bajo permiso /entradas: los comerciales autorizados
    // pueden ver lotes actuales sin necesitar permiso para abrir todo el módulo Stock.
    // Estos lotes NO se atribuyen a un albarán sin un vínculo de recepción verificado.
    async getLotesParaEntradas(req, res) {
        const codProdu = String(req.params.codprodu ?? '').trim().toUpperCase();
        if (!/^[A-Z0-9_-]{1,64}$/.test(codProdu)) {
            return res.status(400).json({ message: 'Referencia de producto no válida.' });
        }
        try {
            const rows = await StockLotesModel.getByCodProdu({ codProdu, almacenes: [0] });
            return res.json(rows);
        } catch (error) {
            console.error('Error consultando lotes actuales para Entradas:', error);
            return res.status(500).json({ message: 'No ha sido posible consultar los lotes actuales.' });
        }
    }

    // Endpoint adicional y protegido. NO sustituye la consulta de stock
    // hasta validar los estados/fechas en el ERP con datos reales.
    async getRecepcionesCompra(req, res) {
        const date = req.query.date || todayMadrid();
        if (!validDate(date)) return res.status(400).json({ message: 'Fecha no válida (AAAA-MM-DD).' });
        try {
            const rows = await getRecepcionesCompraByDate(date);
            return res.json(rows);
        } catch (error) {
            if (error instanceof RecepcionesNoConfiguradasError) {
                return res.status(503).json({ code: error.code, message: error.message });
            }
            console.error('Error consultando albaranes de compra recibidos:', error);
            return res.status(500).json({ message: 'No se pudieron consultar los albaranes de compra.' });
        }
    }

    async getEntradas(req, res) {
        try {
            const { date } = req.query;
            const dateValue = date || new Date().toISOString().split('T')[0];
            const entradas = await ProductModel.getEntradasByDate({ date: dateValue });
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
