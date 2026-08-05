import { AgendaModel } from './agenda.js';

// Capa de compatibilidad para los componentes antiguos de clientes.
export class VisitaModel {
    static async getAllByClientId(clienteId, showCompleted = false, user) {
        return AgendaModel.listVisits({
            user,
            clientId: clienteId,
            statuses: showCompleted ? ['completada'] : ['pendiente', 'en_curso'],
            limit: 500,
        });
    }

    static async create({ cliente_id, date, description, created_by, assigned_to, user }) {
        const actor = user || { id: created_by, role: 'comercial' };
        return AgendaModel.createVisit({
            user: actor,
            input: {
                cliente_id,
                fecha: date,
                titulo: description || 'Visita comercial',
                descripcion: description || '',
                assigned_to: assigned_to || actor.id,
                duracion_minutos: 60,
                tipo: 'visita',
                prioridad: 'media',
            },
        });
    }

    static async markAsCompleted(id, mensajeCompletado, completedBy, user) {
        return AgendaModel.completeVisit({
            id,
            user: user || { id: completedBy, role: 'comercial' },
            input: { resultado: mensajeCompletado || 'Visita completada' },
        });
    }

    static async delete(visitId, user) {
        return AgendaModel.deleteVisit({ id: visitId, user });
    }

    static async getVisitsByDateRange(startDate, endDate, user) {
        return AgendaModel.listVisits({ user, from: startDate, to: endDate, limit: 1000 });
    }

    static async getCalendarVisitsByUser(user) {
        return AgendaModel.listVisits({ user, limit: 1000 });
    }
}
