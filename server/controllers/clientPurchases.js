import { ClientPurchasesModel } from '../models/Postgres/clientPurchases.js';

export class ClientPurchasesController {
    async getByClient(req, res) {
        try {
            const { codclien } = req.params;
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