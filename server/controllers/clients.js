import { ClienteModel } from '../models/Postgres/clients.js';
import { validateCliente, validatePartialCliente } from '../schemas/clients.js';

export class ClienteController {
    async getAll(req, res) {
        try {
            const { localidad, codpais } = req.query;
            const clientes = await ClienteModel.getAll({ localidad, codpais });
            res.json(clientes);
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
}