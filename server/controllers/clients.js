import { ClienteModel } from '../models/Postgres/clients.js';
import { validateCliente, validatePartialCliente } from '../schemas/clients.js';

export class ClienteController {
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, codpais, codprovi, query, status } = req.query;
            const offset = (page - 1) * limit;

            const clientes = await ClienteModel.getAll({ offset, limit, codpais, codprovi, query, status });
            const totalClientes = await ClienteModel.getCount({ codpais, codprovi, query });

            res.json({ clients: clientes, total: totalClientes });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBillingHistory(req, res) {
        try {
            const { codclien } = req.params;
            const history = await ClienteModel.getBillingHistory(codclien);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { codclien } = req.params;
            const cliente = await ClienteModel.getById({ codclien });
            if (cliente) {
                res.json(cliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        const { query, limit = 4 } = req.query;

        try {
            const results = await ClienteModel.search({ query, limit });
            res.status(200).json(results);
        } catch (error) {
            console.error('Error searching clients:', error);
            res.status(500).json({ error: 'Error searching clients' });
        }
    }

    async getByCodclien(req, res) {
        try {
            const { codclien } = req.params;
            const cliente = await ClienteModel.getByCodclien({ codclien });
            if (cliente) {
                res.json(cliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateCliente(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const newCliente = await ClienteModel.create({ input: req.body });
            res.status(201).json(newCliente);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { codclien } = req.params;
            const validationResult = validatePartialCliente(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }
            const updatedCliente = await ClienteModel.update({ codclien, input: req.body });
            if (updatedCliente) {
                res.json(updatedCliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codclien } = req.params;
            const result = await ClienteModel.delete({ codclien });
            if (result) {
                res.json({ message: 'Client deleted' });
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByProvince(req, res) {
        try {
            const { codprovi } = req.params;
            const clients = await ClienteModel.getByProvince({ codprovi });
            res.json(clients);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}