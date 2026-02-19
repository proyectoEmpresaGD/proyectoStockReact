import { VacacionesModel } from '../models/Postgres/vacaciones.js';

const MAX_DIAS_CONSECUTIVOS = 30;
const MIN_NOTICE_DAYS = 21;

function getWorkingDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return 0;
    }

    let count = 0;
    const current = new Date(start);

    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count += 1;
        current.setDate(current.getDate() + 1);
    }

    return count;
}

function resolveYear(fechaInicio) {
    const date = new Date(fechaInicio);
    return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function hasMinimumNotice(fechaInicio, minDays = MIN_NOTICE_DAYS) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(fechaInicio);
    start.setHours(0, 0, 0, 0);

    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + minDays);

    return start >= minDate;
}

export class VacacionesController {
    async list(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const rows = await VacacionesModel.list({
                requesterId: req.user.id,
                requesterRole: req.user.role,
                estado: req.query.estado,
                departamento: req.query.departamento,
                month: req.query.month,
                empleado: req.query.empleado,
            });

            return res.json(rows);
        } catch (error) {
            console.error('Error listando vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo obtener la información de vacaciones.' });
        }
    }

    async getBalance(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const year = Number(req.query.year) || new Date().getFullYear();
            const allowance = await VacacionesModel.getUserAnnualAllowance(req.user.id);
            const consumption = await VacacionesModel.getYearConsumption({ empleadoId: req.user.id, year });

            const diasAprobados = Number(consumption.dias_aprobados || 0);
            const diasPendientes = Number(consumption.dias_pendientes || 0);
            const disponible = Math.max(allowance - diasAprobados - diasPendientes, 0);

            return res.json({
                year,
                allowance,
                dias_aprobados: diasAprobados,
                dias_pendientes: diasPendientes,
                dias_disponibles: disponible,
            });
        } catch (error) {
            console.error('Error obteniendo balance de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo obtener el balance de vacaciones.' });
        }
    }

    async create(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const { fecha_inicio, fecha_fin, motivo } = req.body;
            const dias_solicitados = getWorkingDays(fecha_inicio, fecha_fin);

            if (!fecha_inicio || !fecha_fin || dias_solicitados <= 0) {
                return res.status(400).json({ error: 'Rango de fechas inválido para la solicitud.' });
            }

            if (!hasMinimumNotice(fecha_inicio)) {
                return res.status(400).json({
                    error: `La solicitud debe hacerse con al menos ${MIN_NOTICE_DAYS} días de antelación.`,
                });
            }

            if (dias_solicitados > MAX_DIAS_CONSECUTIVOS) {
                return res.status(400).json({
                    error: `La solicitud supera el máximo de ${MAX_DIAS_CONSECUTIVOS} días laborables consecutivos.`,
                });
            }

            const departamentoReal = await VacacionesModel.getUserDepartment({
                userId: req.user.id,
                fallbackRole: req.user.role || 'general',
            });

            const blockedWeek = await VacacionesModel.isBlockedWeek({
                fecha_inicio,
                fecha_fin,
                departamento: departamentoReal,
            });

            if (blockedWeek) {
                return res.status(400).json({
                    error: `El rango solicitado coincide con una semana bloqueada${blockedWeek.motivo ? `: ${blockedWeek.motivo}` : ''
                        }.`,
                });
            }

            const hasOverlap = await VacacionesModel.hasDateOverlap({
                empleado_id: req.user.id,
                fecha_inicio,
                fecha_fin,
            });

            if (hasOverlap) {
                return res
                    .status(409)
                    .json({ error: 'Ya existe una solicitud pendiente o aprobada en ese rango de fechas.' });
            }

            const year = resolveYear(fecha_inicio);
            const allowance = await VacacionesModel.getUserAnnualAllowance(req.user.id);
            const consumption = await VacacionesModel.getYearConsumption({ empleadoId: req.user.id, year });
            const projected =
                Number(consumption.dias_aprobados || 0) +
                Number(consumption.dias_pendientes || 0) +
                dias_solicitados;

            if (projected > allowance) {
                return res.status(400).json({
                    error: `No tienes saldo suficiente para ese año. Disponible: ${Math.max(
                        allowance - Number(consumption.dias_aprobados || 0) - Number(consumption.dias_pendientes || 0),
                        0
                    )} días.`,
                });
            }

            const maxSimultaneous = await VacacionesModel.getDepartmentMaxSimultaneousVacations(departamentoReal);
            const capacity = await VacacionesModel.checkCapacity({
                departamento: departamentoReal,
                fecha_inicio,
                fecha_fin,
                maxSimultaneous,
            });

            if (capacity.exceeded) {
                return res.status(400).json({
                    error: `Cupo de departamento excedido. Máximo simultáneo: ${maxSimultaneous}.`,
                });
            }

            const created = await VacacionesModel.create({
                input: {
                    empleado_id: req.user.id,
                    empleado_nombre: req.user.nombre || req.user.username || req.user.email || `Empleado ${req.user.id}`,
                    departamento: departamentoReal,
                    fecha_inicio,
                    fecha_fin,
                    dias_solicitados,
                    motivo,
                },
            });

            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando solicitud de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo crear la solicitud de vacaciones.' });
        }
    }

    async cancelOwn(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const id = Number(req.params.id);
            const canceled = await VacacionesModel.cancelByEmployee({ id, empleadoId: req.user.id });

            if (!canceled) {
                return res.status(400).json({ error: 'Solo puedes cancelar solicitudes pendientes y propias.' });
            }

            return res.json(canceled);
        } catch (error) {
            console.error('Error cancelando solicitud de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cancelar la solicitud.' });
        }
    }

    async updateStatus(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Solo administración puede aprobar/rechazar solicitudes.' });
            }

            const id = Number(req.params.id);
            const { estado, comentario_rrhh } = req.body;

            if (!['aprobada', 'rechazada', 'pendiente'].includes(estado)) {
                return res.status(400).json({ error: 'Estado inválido.' });
            }

            const current = await VacacionesModel.getById(id);
            if (!current) {
                return res.status(404).json({ error: 'Solicitud no encontrada.' });
            }

            if (current.estado === 'cancelada') {
                return res.status(400).json({ error: 'No puedes modificar una solicitud cancelada por el empleado.' });
            }

            const updated = await VacacionesModel.updateStatus({ id, estado, comentario_rrhh });
            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando estado de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
        }
    }

    async stats(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const stats = await VacacionesModel.getStats({
                requesterId: req.user.id,
                requesterRole: req.user.role,
            });

            return res.json(stats);
        } catch (error) {
            console.error('Error obteniendo estadísticas de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudieron calcular las estadísticas.' });
        }
    }
}
