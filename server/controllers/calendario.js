import { CalendarioModel } from '../models/Postgres/calendario.js';

export class CalendarioController {
    // GET /api/calendario
    async getAll(req, res) {
        try {
            const userId = req.user.id;

            const registros = await CalendarioModel.getCitasDeUsuario(userId);

            return res.json({ registros });
        } catch (err) {
            console.error('Error Neon getAll:', err);
            return res.status(500).json({ error: 'Error cargando eventos desde PostgreSQL' });
        }
    }

    // POST /api/calendario
    async create(req, res) {
        // Si decides permitir crear eventos, aquí validamos la entrada
        const { descripcion, fecha } = req.body;

        if (!descripcion || !fecha) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        try {
            const nuevo = await CalendarioModel.crearCita({
                descripcion,
                fecha,
                created_by: req.user.id
            });

            return res.status(201).json(nuevo);
        } catch (err) {
            console.error('Error Neon create:', err);
            return res.status(500).json({ error: 'Error creando evento en PostgreSQL' });
        }
    }

    // DELETE /api/calendario/:id
    async delete(req, res) {
        const id = req.params.id;
        const userId = req.user.id;

        try {
            const ok = await CalendarioModel.eliminarCita({ id, userId });
            if (!ok) return res.status(404).json({ error: 'Evento no encontrado o no autorizado' });

            return res.status(204).end();
        } catch (err) {
            console.error('Error Neon delete:', err);
            return res.status(500).json({ error: 'Error eliminando evento desde PostgreSQL' });
        }
    }
}
