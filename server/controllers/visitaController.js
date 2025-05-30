// controllers/visitaController.js
import { VisitaModel } from '../models/Postgres/visitaModel.js';
const pool = globalThis.pool;

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
        const { cliente_id, date, description, assigned_to } = req.body;
        const created_by = req.user.id;

        try {
            if (!cliente_id) {
                return res.status(400).json({ error: 'cliente_id es obligatorio' });
            }

            const newVisit = await VisitaModel.create({ cliente_id, date, description, created_by, assigned_to });
            res.status(201).json(newVisit);
        } catch (error) {
            console.error("Error en createVisit:", error);
            res.status(500).json({ error: error.message });
        }
    }



    async getVisitasCalendario(req, res) {
        const userId = req.user.id;

        try {
            const visitas = await VisitaModel.getCalendarVisitsByUser(userId);
            res.json(visitas);
        } catch (err) {
            console.error('Error cargando visitas para calendario:', err);
            res.status(500).json({ error: 'Error cargando visitas' });
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
