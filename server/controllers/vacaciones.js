import { VacacionesModel } from '../models/Postgres/vacaciones.js';

const MAX_DIAS_CONSECUTIVOS = 30;
const MIN_NOTICE_DAYS = 21;
const MANAGER_ROLES = ['admin', 'rrhh'];

// Vacaciones: 24 total, 2 obligatorias (24/12 y 31/12) => 22 a elegir
const COMPANY_MANDATORY_MMDD = ['12-24', '12-31'];
const COMPANY_MANDATORY_DAYS_PER_YEAR = COMPANY_MANDATORY_MMDD.length;

function canManage(role) {
    return MANAGER_ROLES.includes(String(role || '').toLowerCase());
}

function normalizeDateKey(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function isCompanyMandatoryDate(dateObj) {
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return false;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return COMPANY_MANDATORY_MMDD.includes(`${mm}-${dd}`);
}

async function getWorkingDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return 0;
    }

    // Si el rango cruza años, cargamos no-laborables de todos los años implicados
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    const nonWorkingSet = new Set();
    for (let y = startYear; y <= endYear; y += 1) {
        const nonWorkingRows = await VacacionesModel.listNonWorkingDays({ year: y, activeOnly: true });
        for (const row of nonWorkingRows) {
            nonWorkingSet.add(normalizeDateKey(row.fecha));
        }
    }

    let count = 0;
    const current = new Date(start);

    while (current <= end) {
        const day = current.getDay();
        const isWeekend = day === 0 || day === 6;

        // IMPORTANTE:
        // - Los días no laborables (festivos) NO cuentan como días solicitados.
        // - Los días obligatorios de empresa (24/12 y 31/12) NO cuentan en la solicitud
        //   porque se descuentan SIEMPRE en el balance anual (para evitar doble descuento).
        const dateKey = normalizeDateKey(current);
        const isNonWorking = nonWorkingSet.has(dateKey);
        const isMandatory = isCompanyMandatoryDate(current);

        if (!isWeekend && !isNonWorking && !isMandatory) count += 1;
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

            // allowance = días totales del año (incluyendo los 2 obligatorios)
            const allowance = await VacacionesModel.getUserAnnualAllowance(req.user.id);

            const consumption = await VacacionesModel.getYearConsumption({ empleadoId: req.user.id, year });
            const diasAprobados = Number(consumption.dias_aprobados || 0);
            const diasPendientes = Number(consumption.dias_pendientes || 0);

            // Restamos SIEMPRE los días obligatorios de empresa del saldo disponible
            const diasObligatorios = Math.min(COMPANY_MANDATORY_DAYS_PER_YEAR, Math.max(allowance, 0));
            const disponible = Math.max(allowance - diasObligatorios - diasAprobados - diasPendientes, 0);

            return res.json({
                year,
                allowance, // 24 (o personalizado por usuario)
                dias_obligatorios: diasObligatorios, // 2
                dias_libres: Math.max(allowance - diasObligatorios, 0), // 22
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
            const dias_solicitados = await getWorkingDays(fecha_inicio, fecha_fin);

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
            const ajustes = await VacacionesModel.getYearAdjustments({ empleadoId: req.user.id, year });
            const effectiveAllowance = allowance + ajustes;
            const projected =
                Number(consumption.dias_aprobados || 0) +
                Number(consumption.dias_pendientes || 0) +
                dias_solicitados;

            if (projected > effectiveAllowance) {
                return res.status(400).json({
                    error: `No tienes saldo suficiente para ese año. Disponible: ${Math.max(
                        effectiveAllowance - Number(consumption.dias_aprobados || 0) - Number(consumption.dias_pendientes || 0),
                        0
                    )} días.`,
                });
            }

            const shouldApplyCapacity = !VacacionesModel.isCapacityExemptDepartment(departamentoReal);

            if (shouldApplyCapacity) {
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

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede aprobar o rechazar solicitudes.' });
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
    async employeesSummary(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede consultar resúmenes por empleado.' });
            }

            const year = Number(req.query.year) || new Date().getFullYear();
            const rows = await VacacionesModel.getEmployeesSummary({ year });
            return res.json(rows);
        } catch (error) {
            console.error('Error obteniendo resumen por empleados:', error);
            return res.status(500).json({ error: 'No se pudo obtener el resumen por empleados.' });
        }
    }

    async employeeTimeline(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede consultar historial por empleado.' });
            }

            const empleadoId = Number(req.params.empleadoId);
            if (!empleadoId) {
                return res.status(400).json({ error: 'Empleado inválido.' });
            }

            const year = Number(req.query.year) || new Date().getFullYear();
            const rows = await VacacionesModel.getEmployeeTimeline({ empleadoId, year });
            return res.json(rows);
        } catch (error) {
            console.error('Error obteniendo historial por empleado:', error);
            return res.status(500).json({ error: 'No se pudo obtener el historial del empleado.' });
        }
    }

    async listNonWorkingDays(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede consultar días no laborables.' });
            }

            const rows = await VacacionesModel.listNonWorkingDays({
                year: req.query.year,
                activeOnly: req.query.activeOnly === 'true',
            });

            return res.json(rows);
        } catch (error) {
            console.error('Error listando días no laborables:', error);
            return res.status(500).json({ error: 'No se pudieron listar los días no laborables.' });
        }
    }

    async createNonWorkingDay(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede crear días no laborables.' });
            }

            const { fecha, descripcion, ambito } = req.body;
            if (!fecha || Number.isNaN(new Date(fecha).getTime())) {
                return res.status(400).json({ error: 'Fecha inválida para día no laborable.' });
            }

            const created = await VacacionesModel.createNonWorkingDay({ fecha, descripcion, ambito });
            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando día no laborable:', error);
            return res.status(500).json({ error: 'No se pudo crear el día no laborable.' });
        }
    }

    async toggleNonWorkingDay(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede activar o desactivar días.' });
            }

            const id = Number(req.params.id);
            const updated = await VacacionesModel.toggleNonWorkingDay({ id, activa: req.body?.activa });
            if (!updated) return res.status(404).json({ error: 'Día no laborable no encontrado.' });

            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando día no laborable:', error);
            return res.status(500).json({ error: 'No se pudo actualizar el día no laborable.' });
        }
    }

    async deleteNonWorkingDay(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede eliminar días.' });
            }

            const id = Number(req.params.id);
            const deleted = await VacacionesModel.deleteNonWorkingDay(id);
            if (!deleted) return res.status(404).json({ error: 'Día no laborable no encontrado.' });

            return res.status(204).send();
        } catch (error) {
            console.error('Error eliminando día no laborable:', error);
            return res.status(500).json({ error: 'No se pudo eliminar el día no laborable.' });
        }
    }

    async listBlockedWeeks(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede consultar semanas bloqueadas.' });
            }

            const rows = await VacacionesModel.listBlockedWeeks({
                departamento: req.query.departamento,
                activeOnly: req.query.activeOnly === 'true',
            });

            return res.json(rows);
        } catch (error) {
            console.error('Error listando semanas bloqueadas:', error);
            return res.status(500).json({ error: 'No se pudieron listar las semanas bloqueadas.' });
        }
    }

    async createBlockedWeek(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede crear semanas bloqueadas.' });
            }

            const { departamento, fecha_inicio, fecha_fin, motivo } = req.body;
            if (!fecha_inicio || !fecha_fin || new Date(fecha_inicio) > new Date(fecha_fin)) {
                return res.status(400).json({ error: 'Rango de fechas inválido para la semana bloqueada.' });
            }

            const created = await VacacionesModel.createBlockedWeek({ departamento, fecha_inicio, fecha_fin, motivo });
            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando semana bloqueada:', error);
            return res.status(500).json({ error: 'No se pudo crear la semana bloqueada.' });
        }
    }

    async toggleBlockedWeek(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede activar o desactivar semanas.' });
            }

            const id = Number(req.params.id);
            const updated = await VacacionesModel.toggleBlockedWeek({ id, activa: req.body?.activa });
            if (!updated) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });

            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando semana bloqueada:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la semana bloqueada.' });
        }
    }

    async deleteBlockedWeek(req, res) {
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede eliminar semanas.' });
            }

            const id = Number(req.params.id);
            const deleted = await VacacionesModel.deleteBlockedWeek(id);
            if (!deleted) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });

            return res.status(204).send();
        } catch (error) {
            console.error('Error eliminando semana bloqueada:', error);
            return res.status(500).json({ error: 'No se pudo eliminar la semana bloqueada.' });
        }
    }
}