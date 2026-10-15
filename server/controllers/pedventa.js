import { PedVentaModel } from '../models/Postgres/pedventa.js';
import { ensureClientAccess } from '../utils/clientPortfolioAccess.js';

export class PedVentaController {



    async getAll(req, res) {
        try {
            const pedidos = await PedVentaModel.getAll();
            if (pedidos) {
                res.json(pedidos);
            } else {
                res.status(404).json({ message: 'No orders found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByClient(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const { ejercicio } = req.query;           // <-- nuevo
            const ventas = await PedVentaModel.getByClient({ codclien, ejercicio });

            // Un cliente existente puede no tener pedidos/ventas en pedventa.
            // Eso no es un recurso inexistente: devolvemos una colección vacía con 200.
            res.json(ventas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }


    async create(req, res) {
        try {
            if (!req.body?.codclien || !await ensureClientAccess(req, res, req.body.codclien)) return;
            const newVenta = await PedVentaModel.create({ input: req.body });
            res.status(201).json(newVenta);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const owner = await PedVentaModel.getClientCodeById(id);
            if (!owner) return res.status(404).json({ message: 'Sale not found' });
            if (!await ensureClientAccess(req, res, owner)) return;
            if (req.body?.codclien && String(req.body.codclien) !== String(owner)) {
                return res.status(400).json({ message: 'No se permite cambiar el cliente del pedido.' });
            }
            const { codclien: _clientCode, ...editable } = req.body || {};
            const updatedVenta = await PedVentaModel.update({ id, input: editable });
            if (updatedVenta) {
                res.json(updatedVenta);
            } else {
                res.status(404).json({ message: 'Sale not found' });
            }
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const owner = await PedVentaModel.getClientCodeById(id);
            if (!owner) return res.status(404).json({ message: 'Sale not found' });
            if (!await ensureClientAccess(req, res, owner)) return;
            const result = await PedVentaModel.delete({ id });
            if (result) {
                res.json({ message: 'Sale deleted' });
            } else {
                res.status(404).json({ message: 'Sale not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }




}
