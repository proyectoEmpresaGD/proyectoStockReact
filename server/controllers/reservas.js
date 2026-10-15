import { ReservasModel } from '../models/Postgres/reservas.js';
import { ClienteModel } from '../models/Postgres/clients.js';


const getReservaUsernameFromRequest = (req) => {
    return (
        req.user?.username ||
        req.user?.usuario ||
        req.user?.email ||
        String(req.user?.id || '')
    );
};


export class ReservasController {
    async searchClientes(req, res) {
        try {
            const query = String(req.query?.query ?? '').trim();
            const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/[^a-z0-9]/g, '');
            // Evitar devolver clientes al abrir el selector con búsquedas vacías.
            if (normalized.length < 2) return res.json([]);
            if (query.length > 120) {
                return res.status(400).json({ message: 'La búsqueda es demasiado larga.' });
            }

            const requestedLimit = Number.parseInt(req.query?.limit, 10);
            const limit = Number.isFinite(requestedLimit)
                ? Math.min(Math.max(requestedLimit, 1), 50)
                : 50;
            // SIN restricciones de cartera: es un selector de clientes de Reservas,
            // no la consulta de fichas, historiales o ventas de Gestión de clientes.
            const clientes = await ClienteModel.search({ query, limit });
            return res.json(clientes);
        } catch (error) {
            console.error('Error buscando clientes para reservas:', error);
            return res.status(500).json({ message: 'No se han podido buscar clientes.' });
        }
    }

    async getReservas(req, res) {
        try {
            const reservas = await ReservasModel.getReservas();
            res.json(reservas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getReservaById(req, res) {
        try {
            const { idreserva } = req.params;
            const reserva = await ReservasModel.getReservaById({ idreserva });

            if (!reserva) {
                return res.status(404).json({ message: 'Reserva no encontrada.' });
            }

            res.json(reserva);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async setReservas(req, res) {
        try {
            const nuevaReserva = await ReservasModel.setReservas({
                input: {
                    ...req.body,
                    usuario: getReservaUsernameFromRequest(req),
                },
            });

            res.status(201).json(nuevaReserva);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async updateReservas(req, res) {
        try {
            const { idreserva } = req.params;

            const reservaActualizada = await ReservasModel.updateReservas({
                idreserva,
                input: {
                    ...req.body,
                    usuario: getReservaUsernameFromRequest(req),
                },
            });

            if (!reservaActualizada) {
                return res.status(404).json({ message: 'Reserva no encontrada.' });
            }

            res.json(reservaActualizada);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getReservasActivasNuevas(req, res) {
        try {
            const afterId = Number(req.query.afterId || 0);

            const reservas = await ReservasModel.getReservasActivasNuevas({ afterId });

            return res.json(reservas);
        } catch (error) {
            console.error(error);

            return res.status(500).json({
                message: error.message || 'Error obteniendo reservas activas nuevas.',
            });
        }
    }

    async deleteReservas(req, res) {
        try {
            const { idreserva } = req.params;
            const reservaEliminada = await ReservasModel.deleteReservas({ idreserva });

            if (!reservaEliminada) {
                return res.status(404).json({ message: 'Reserva no encontrada.' });
            }

            res.json({ message: 'Reserva eliminada correctamente.', reserva: reservaEliminada });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getLotesDisponiblesByProducto(req, res) {
        try {
            const { codprodu } = req.params;

            const lotes = await ReservasModel.getLotesDisponiblesByProducto({ codprodu });

            res.json(lotes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getReservasActivasByProducto(req, res) {
        try {
            const { codprodu } = req.params;
            const reservas = await ReservasModel.getReservasActivasByProducto({ codprodu });
            res.json(reservas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}