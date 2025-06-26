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

    async getLowStockAlerts(req, res) {
        try {
            const all = await StockModel.getLowStockAlerts();

            // Lista completa de términos a excluir (frontend + index.js)
            const EXCLUDE_TERMS = [
                'QUALITY', 'TAPILLA', 'CUTTINGS?', 'RIEL', 'RIELES', 'HERRAJES', 'SOBRES', 'CARGO', 'RELLENO',
                'CERTIFICADO', 'TRABAJOS', 'COJIN', 'CUBRE', 'ESTOR', 'CAIDA', 'PLAID', 'CABECERO', 'ETAMIN',
                'CARTULINA', 'PORTES', 'COSTE DEL TRANSPORTE', 'MECANISMOS', 'BOLSAS', 'TUBOS', 'SERVILLETAS',
                'CONTRACT', 'COMISION', 'COLCHA', 'PERCHA', 'LIBRO', 'VARIOS', 'CARRE GAME', 'LIENZO', 'BOLONIA',
                'VARADERO', 'TAIGA', 'DUNE', 'ZAMFARA', 'SHIRA', 'CALCUTA', 'POISON', 'TUNDRA', 'AGATA', 'CUARZO',
                'DIAMANTE', 'SUEDER', 'SIDDHARTA', 'NOMAD', 'HABITAT', 'GRAVITY', 'LUNAR', 'CANDIDA', 'BAMBU',
                'PARLOUR', 'BENNELONG', 'MACARENA', 'NIJAR', 'MOJACAR', 'LOSENGO', 'VELVETY', 'MENORCA', 'BAUPRES',
                'LOST ODISSEY', 'MEROPS', 'MARTINA', 'ORQUIDEA', 'GASHGAI', 'DAMASCO', 'DOVES', 'SENES', 'ESPERANZA',
                'INMACULADA', 'ATLAS', 'MIRROR', 'ANTILLA', 'ANTILLA VELVET', 'LUMIERE', 'MIGRATION', 'NIMBOSILVA',
                'PERSIAN MOOD', 'RINPA', 'SURIRI', 'XUBEC', 'AHURA', 'IMPERIAL', 'KUKULCAN', 'MOIRE', 'MOREAU',
                'PERRAULT', 'PUMMERIN', 'TOPKAPI', 'TULUM', 'ZAHARA', 'ITALY', 'SWITZERLAND', 'TRANSPORT', 'AUSTRIA',
                'BELGIUM', 'FRANCE', 'UNITED KINGDOM', 'ARRENDAMIENTOS', 'IGNIFUGACIÓN'
            ];
            const excludeRegex = new RegExp(EXCLUDE_TERMS.join('|'), 'i');

            // Prefijos válidos para telas (marcas)
            const marcasTela = /^(CJM|HAR|BAS|ARE|FLA)/i;
            // Colecciones específicas
            const colecciones = [
                'stratos', 'diamante', 'urban contemporary', 'revoltoso vol i', 'revoltoso vol ii'
            ];

            // Filtrar y ordenar alfabéticamente
            const lowTelas = all
                .filter(item => {
                    const des = item.desprodu || '';
                    const codp = item.codprodu || '';
                    const cole = (item.coleccion || '').toLowerCase();
                    return (
                        parseFloat(item.stockactual) < 30 &&
                        marcasTela.test(codp) &&
                        !excludeRegex.test(des) &&
                        (colecciones.length === 0 || colecciones.includes(cole))
                    );
                })
                .sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));

            const lowLibros = all
                .filter(item => {
                    const des = item.desprodu || '';
                    return (
                        parseFloat(item.stockactual) < 30 &&
                        /(?:LIBRO|CARRE GAME)/i.test(des) &&
                        !excludeRegex.test(des)
                    );
                })
                .sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));

            const lowPerchas = all
                .filter(item => {
                    const des = item.desprodu || '';
                    return (
                        parseFloat(item.stockactual) < 10 &&
                        /PERCHA/i.test(des) &&
                        !excludeRegex.test(des)
                    );
                })
                .sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));

            res.json({ telas: lowTelas, libros: lowLibros, perchas: lowPerchas });
        } catch (error) {
            console.error("Error fetching low stock alerts:", error);
            res.status(500).json({ error: error.message });
        }
    }





}