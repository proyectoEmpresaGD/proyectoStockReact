import { ClientPurchasesModel } from '../models/Postgres/clientPurchases.js';
import { ensureClientAccess } from '../utils/clientPortfolioAccess.js';

export class ClientPurchasesController {
    async getCodesByClient(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const codes = await ClientPurchasesModel.getPurchasedCodes(codclien);
            return res.json(codes);
        } catch (error) {
            console.error('Error consultando códigos comprados:', error);
            return res.status(500).json({ message: 'No se pudieron consultar los productos comprados.' });
        }
    }

    async getByClient(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const { ejercicio } = req.query;

            const purchases = await ClientPurchasesModel.getByClient({
                codclien,
                ejercicio,
            });

            res.json(purchases);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}