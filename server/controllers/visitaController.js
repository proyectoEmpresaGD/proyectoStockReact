// controllers/visitaController.js
import { VisitaModel } from '../models/Postgres/visitaModel.js';

export class VisitaController {
    async getVisitsByClienteId(req, res) {
        const { cliente_id } = req.params;
        const showCompleted = req.query.showCompleted === 'true'; // Permitir mostrar visitas completadas solo si showCompleted es true
        try {
            const visits = await VisitaModel.getAllByClientId(cliente_id, showCompleted);
            res.json(visits);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createVisit(req, res) {
        const { cliente_id } = req.params; // Cliente ID desde los parámetros de la URL
        const { date, description, assigned_to } = req.body; // Desestructuramos `assigned_to` del cuerpo de la solicitud
        const created_by = req.user.id; // ID del usuario autenticado

        try {
            // Asegurarnos de que `assigned_to` se pasa al modelo para almacenar la visita correctamente
            const newVisit = await VisitaModel.create({ cliente_id, date, description, created_by, assigned_to });
            res.status(201).json(newVisit);
        } catch (error) {
            console.error("Error en createVisit:", error); // Registro de errores para depuración
            res.status(500).json({ error: error.message });
        }
    }


    async deleteVisit(req, res) {
        const { id } = req.params;
        try {
            const deletedVisit = await VisitaModel.delete(id);
            res.json(deletedVisit);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async markVisitAsCompleted(req, res) {
        const { id } = req.params;
        const { mensaje_completado } = req.body;
        const completed_by = req.user.id; // ID del usuario autenticado
        try {
            const completedVisit = await VisitaModel.markAsCompleted(id, mensaje_completado, completed_by);
            res.json(completedVisit);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
