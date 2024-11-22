import { PedVentaModel } from '../models/Postgres/pedventa.js';

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
            const ventas = await PedVentaModel.getByClient({ codclien });
            if (ventas) {
                res.json(ventas);
            } else {
                res.status(404).json({ message: 'No sales found for this client' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const newVenta = await PedVentaModel.create({ input: req.body });
            res.status(201).json(newVenta);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const updatedVenta = await PedVentaModel.update({ id, input: req.body });
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
