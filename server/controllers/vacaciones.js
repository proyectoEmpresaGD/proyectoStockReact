import { VacacionesModel } from '../models/Postgres/vacaciones.js';
import { countCompanyWorkingDays, validateVacationEndpoints } from '../utils/vacationDateRules.js';

const MANAGER_ROLES = ['admin', 'rrhh'];

function canManage(role) {
    return MANAGER_ROLES.includes(String(role || '').toLowerCase());
}

function normalizeDateKey(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function resolveYear(dateValue) {
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function hasMinimumNotice(fechaInicio, minDays) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(fechaInicio);
    start.setHours(0, 0, 0, 0);

    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + Number(minDays || 0));
    return start >= minDate;
}

async function getWorkingDays(startDate, endDate, annualConfig) {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return 0;

    const nonWorkingRows = await VacacionesModel.listNonWorkingDays({ year: start.getFullYear(), activeOnly: true });
    return countCompanyWorkingDays(startDate, endDate, {
        nonWorkingDates: nonWorkingRows.map((row) => normalizeDateKey(row.fecha)),
        mandatoryMmDd: Array.isArray(annualConfig?.fechas_obligatorias) ? annualConfig.fechas_obligatorias : [],
    });
}

function isValidMmDd(value, year = 2000) {
    const raw = String(value || '').trim();
    const match = /^(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return false;

    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const probe = new Date(Date.UTC(Number(year), month - 1, day));
    return probe.getUTCFullYear() === Number(year)
        && probe.getUTCMonth() === month - 1
        && probe.getUTCDate() === day;
}

function buildMandatoryDates(year, config) {
    return (Array.isArray(config?.fechas_obligatorias) ? config.fechas_obligatorias : [])
        .map((value) => String(value || '').trim())
        .filter((value) => isValidMmDd(value, year))
        .map((value) => `${year}-${value}`);
}

function userDisplayName(user) {
    const fullName = [user?.nombre, user?.apellido1, user?.apellido2]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    return fullName || user?.username || user?.email || (user?.id ? `Empleado ${user.id}` : null);
}

function actorInfo(req) {
    return {
        actorId: req.user?.id || null,
        actorNombre: userDisplayName(req.user),
        actorRole: req.user?.role || null,
    };
}

async function safeAudit(req, payload) {
    try {
        await VacacionesModel.logAudit({ ...actorInfo(req), ...payload });
    } catch (error) {
        console.error('Error registrando auditoría de vacaciones:', error);
    }
}

async function safeNotifyUser(payload) {
    try {
        await VacacionesModel.createNotification(payload);
    } catch (error) {
        console.error('Error creando notificación de vacaciones:', error);
    }
}

async function safeNotifyManagers(payload) {
    try {
        await VacacionesModel.createManagerNotifications(payload);
    } catch (error) {
        console.error('Error notificando a RRHH sobre vacaciones:', error);
    }
}

function csvCell(value) {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

async function getBalanceProjection({
    empleadoId,
    year,
    annualConfig,
    fechaInicio,
    fechaFin,
    diasSolicitados,
    excludeRequestId = null,
    createdBy = null,
}) {
    const allowanceInfo = await VacacionesModel.getUserAllowanceForYear({
        userId: empleadoId,
        year,
        fallbackAllowance: annualConfig.dias_base_default,
        freezeIfMissing: true,
        createdBy,
    });
    const allowance = Number(allowanceInfo.allowance || 0);
    const adjustments = Number(await VacacionesModel.getYearAdjustments({ empleadoId, year }) || 0);
    const mandatoryCount = await VacacionesModel.getMandatoryVacationDayCount({
        year,
        fechasMMDD: annualConfig.fechas_obligatorias,
    });
    const baseSelectable = Math.max(allowance + adjustments - mandatoryCount, 0);
    const carry = await VacacionesModel.getCarryoverForYear({ empleadoId, year });

    if (!carry) {
        const consumption = await VacacionesModel.getYearConsumption({ empleadoId, year, excludeRequestId });
        const reserved = Number(consumption.dias_aprobados || 0) + Number(consumption.dias_pendientes || 0);
        return {
            ok: reserved + Number(diasSolicitados || 0) <= baseSelectable,
            available: Math.max(baseSelectable - reserved, 0),
            baseSelectable,
            carryover: 0,
            carryoverLimit: null,
        };
    }

    const limitKey = String(carry.limite_fecha).slice(0, 10);
    const split = await VacacionesModel.getYearConsumptionSplit({
        empleadoId,
        year,
        limiteFecha: limitKey,
        excludeRequestId,
    });
    const startKey = normalizeDateKey(fechaInicio);
    const endKey = normalizeDateKey(fechaFin);
    let requestEarly = 0;
    let requestLate = 0;

    if (endKey <= limitKey) {
        requestEarly = Number(diasSolicitados || 0);
    } else if (startKey > limitKey) {
        requestLate = Number(diasSolicitados || 0);
    } else {
        requestEarly = await getWorkingDays(fechaInicio, limitKey, annualConfig);
        requestLate = Math.max(Number(diasSolicitados || 0) - requestEarly, 0);
    }

    const carryTotal = Number(carry.dias || 0);
    const early = Number(split.dias_tempranos || 0) + requestEarly;
    const late = Number(split.dias_tardios || 0) + requestLate;
    const baseUsedEarly = Math.max(early - carryTotal, 0);
    const requiredBase = baseUsedEarly + late;
    const existingBaseUsedEarly = Math.max(Number(split.dias_tempranos || 0) - carryTotal, 0);
    const availableBase = Math.max(baseSelectable - existingBaseUsedEarly - Number(split.dias_tardios || 0), 0);
    const availableCarry = Math.max(carryTotal - Number(split.dias_tempranos || 0), 0);

    return {
        ok: requiredBase <= baseSelectable,
        available: availableBase + (endKey <= limitKey ? availableCarry : 0),
        baseSelectable,
        carryover: carryTotal,
        carryoverLimit: limitKey,
    };
}

async function getCapacityConflicts({ departamento, role, fechaInicio, fechaFin, excludeRequestId = null }) {
    const conflicts = [];
    const configuredRules = await VacacionesModel.getApplicableCapacityRules({ departamento, role });

    for (const rule of configuredRules) {
        const capacity = await VacacionesModel.checkRuleCapacity({
            tipo: rule.tipo,
            valor: rule.valor,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            maxSimultaneous: rule.max_personas,
            excludeRequestId,
        });
        if (capacity.exceeded) {
            conflicts.push({
                tipo: rule.tipo,
                valor: rule.valor,
                max_personas: Number(rule.max_personas),
                projected: Number(capacity.projectedMax || 0),
            });
        }
    }

    const hasDepartmentRule = configuredRules.some((rule) => rule.tipo === 'departamento');
    if (!hasDepartmentRule && !VacacionesModel.isCapacityExemptDepartment(departamento)) {
        const maxSimultaneous = await VacacionesModel.getDepartmentMaxSimultaneousVacations(departamento);
        const capacity = await VacacionesModel.checkCapacity({
            departamento,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            maxSimultaneous,
            excludeRequestId,
        });
        if (capacity.exceeded) {
            conflicts.push({
                tipo: 'departamento',
                valor: departamento,
                max_personas: Number(maxSimultaneous),
                projected: Number(capacity.projectedMax || 0),
                fallback: true,
            });
        }
    }

    return conflicts;
}

export class VacacionesController {
    async getModuleAccess(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const settings = await VacacionesModel.getVacationUserSettings(req.user.id);
            const canAccess = await VacacionesModel.canAccessVacationModule({
                userId: req.user.id,
                role: req.user.role,
            });

            return res.json({
                acceso_modulo: canAccess,
                participa: settings?.participa !== false,
                is_manager: canManage(req.user.role),
                role: req.user.role || settings?.role || null,
            });
        } catch (error) {
            console.error('Error comprobando acceso al módulo de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo comprobar el acceso al módulo de vacaciones.' });
        }
    }

    async requireModuleAccess(req, res, next) {
        try {
            await VacacionesModel.ensureTable();
            const canAccess = await VacacionesModel.canAccessVacationModule({
                userId: req.user.id,
                role: req.user.role,
            });

            if (!canAccess) {
                return res.status(403).json({
                    error: 'No tienes acceso al módulo de vacaciones. Contacta con un administrador si necesitas utilizarlo.',
                    code: 'VACACIONES_MODULE_ACCESS_DENIED',
                });
            }

            return next();
        } catch (error) {
            console.error('Error validando acceso al módulo de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo validar el acceso al módulo de vacaciones.' });
        }
    }

    async list(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const rows = await VacacionesModel.list({
                requesterId: req.user.id,
                requesterRole: req.user.role,
                estado: req.query.estado,
                departamento: req.query.departamento,
                month: req.query.month,
                year: req.query.year,
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

            const participates = await VacacionesModel.isVacationParticipant(req.user.id);
            if (!canManage(req.user.role) && !participates) {
                return res.status(403).json({ error: 'Tu cuenta no participa actualmente en el sistema de vacaciones. Contacta con RRHH si crees que es un error.' });
            }

            const year = Number(req.query.year) || new Date().getFullYear();

            const annualConfig = await VacacionesModel.getAnnualConfig(year);
            const allowanceInfo = await VacacionesModel.getUserAllowanceForYear({
                userId: req.user.id,
                year,
                fallbackAllowance: annualConfig.dias_base_default,
                freezeIfMissing: Boolean(annualConfig.permitir_solicitudes && participates),
            });
            const allowance = Number(allowanceInfo.allowance || 0);
            const ajustes = await VacacionesModel.getYearAdjustments({ empleadoId: req.user.id, year });
            const effectiveAllowance = Math.max(allowance + ajustes, 0);

            const consumption = await VacacionesModel.getYearConsumption({ empleadoId: req.user.id, year });
            const diasAprobados = Number(consumption.dias_aprobados || 0);
            const diasPendientes = Number(consumption.dias_pendientes || 0);

            const mandatoryCount = await VacacionesModel.getMandatoryVacationDayCount({
                year,
                fechasMMDD: annualConfig.fechas_obligatorias,
            });
            const diasObligatorios = Math.min(mandatoryCount, effectiveAllowance);
            const diasLibres = Math.max(effectiveAllowance - diasObligatorios, 0);

            const carry = await VacacionesModel.getCarryoverForYear({ empleadoId: req.user.id, year });
            let diasArrastre = 0;
            let diasArrastreDisponibles = 0;
            let arrastreLimiteFecha = null;
            let disponible = Math.max(diasLibres - diasAprobados - diasPendientes, 0);

            if (carry) {
                diasArrastre = Number(carry.dias || 0);
                arrastreLimiteFecha = String(carry.limite_fecha).slice(0, 10);
                const split = await VacacionesModel.getYearConsumptionSplit({
                    empleadoId: req.user.id,
                    year,
                    limiteFecha: arrastreLimiteFecha,
                });
                const early = Number(split.dias_tempranos || 0);
                const late = Number(split.dias_tardios || 0);
                const baseUsedEarly = Math.max(early - diasArrastre, 0);
                const baseRemaining = Math.max(diasLibres - baseUsedEarly - late, 0);
                const todayKey = normalizeDateKey(new Date());
                diasArrastreDisponibles = todayKey <= arrastreLimiteFecha
                    ? Math.max(diasArrastre - early, 0)
                    : 0;
                disponible = baseRemaining + diasArrastreDisponibles;
            }

            return res.json({
                year,
                allowance,
                ajustes,
                allowance_efectivo: effectiveAllowance,
                dias_obligatorios: diasObligatorios,
                dias_libres: diasLibres,
                dias_aprobados: diasAprobados,
                dias_pendientes: diasPendientes,
                dias_disponibles: disponible,
                dias_arrastre: diasArrastre,
                dias_arrastre_disponibles: diasArrastreDisponibles,
                arrastre_limite_fecha: arrastreLimiteFecha,
                configuracion: annualConfig,
                cupo_congelado: allowanceInfo.congelado,
                cupo_fuente: allowanceInfo.fuente,
                cupo_congelado_at: allowanceInfo.congelado_at,
            });
        } catch (error) {
            console.error('Error obteniendo balance de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo obtener el balance de vacaciones.' });
        }
    }

    async create(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();

            if (!(await VacacionesModel.isVacationParticipant(req.user.id))) {
                return res.status(403).json({ error: 'Tu cuenta no está incluida en la gestión de vacaciones.' });
            }

            const { fecha_inicio, fecha_fin, motivo } = req.body || {};
            const startDate = new Date(fecha_inicio);
            const endDate = new Date(fecha_fin);
            if (!fecha_inicio || !fecha_fin || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
                return res.status(400).json({ error: 'Rango de fechas inválido para la solicitud.' });
            }

            const endpointError = validateVacationEndpoints(fecha_inicio, fecha_fin);
            if (endpointError) {
                return res.status(400).json({ error: endpointError });
            }

            const startYear = startDate.getFullYear();
            const endYear = endDate.getFullYear();
            if (startYear !== endYear) {
                return res.status(400).json({
                    error: 'Una solicitud no puede cruzar dos años. Divide las vacaciones en una solicitud por cada año.',
                });
            }

            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(startYear);

            const annualConfig = await VacacionesModel.getAnnualConfig(startYear);
            if (!annualConfig.permitir_solicitudes) {
                return res.status(400).json({ error: `Las solicitudes de vacaciones de ${startYear} están cerradas temporalmente por RRHH.` });
            }

            const dias_solicitados = await getWorkingDays(fecha_inicio, fecha_fin, annualConfig);
            if (dias_solicitados <= 0) {
                return res.status(400).json({ error: 'El rango no contiene días laborables seleccionables.' });
            }

            if (!hasMinimumNotice(fecha_inicio, annualConfig.antelacion_minima_dias)) {
                return res.status(400).json({
                    error: `La solicitud debe hacerse con al menos ${annualConfig.antelacion_minima_dias} días de antelación.`,
                });
            }

            if (dias_solicitados > Number(annualConfig.max_dias_consecutivos)) {
                return res.status(400).json({
                    error: `La solicitud supera el máximo de ${annualConfig.max_dias_consecutivos} días laborables consecutivos.`,
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

            const year = startYear;
            const balanceProjection = await getBalanceProjection({
                empleadoId: req.user.id,
                year,
                annualConfig,
                fechaInicio: fecha_inicio,
                fechaFin: fecha_fin,
                diasSolicitados: dias_solicitados,
            });
            if (!balanceProjection.ok) {
                return res.status(400).json({
                    error: `No tienes saldo suficiente para ese periodo. Disponible compatible con esas fechas: ${Math.max(balanceProjection.available, 0)} días.`,
                });
            }

            const conflicts = await getCapacityConflicts({
                departamento: departamentoReal,
                role: req.user.role,
                fechaInicio: fecha_inicio,
                fechaFin: fecha_fin,
            });
            if (conflicts.length > 0) {
                const first = conflicts[0];
                return res.status(409).json({
                    error: `Cupo de ${first.tipo === 'rol' ? 'rol' : 'departamento'} excedido para ${first.valor}. Máximo simultáneo: ${first.max_personas}.`,
                    code: 'CAPACITY_CONFLICT',
                    conflicts,
                });
            }

            const created = await VacacionesModel.create({
                input: {
                    empleado_id: req.user.id,
                    empleado_nombre: userDisplayName(req.user),
                    departamento: departamentoReal,
                    empleado_role: req.user.role || null,
                    fecha_inicio,
                    fecha_fin,
                    dias_solicitados,
                    motivo,
                },
            });

            await safeAudit(req, {
                accion: 'solicitud_creada',
                entidadTipo: 'solicitud',
                entidadId: created?.id || null,
                empleadoId: req.user.id,
                year,
                detalle: { fecha_inicio, fecha_fin, dias_solicitados, motivo: motivo || null },
            });
            await safeNotifyManagers({
                tipo: 'nueva_solicitud',
                titulo: 'Nueva solicitud de vacaciones',
                mensaje: `${created?.empleado_nombre || 'Un empleado'} ha solicitado ${dias_solicitados} día${dias_solicitados === 1 ? '' : 's'} (${fecha_inicio} - ${fecha_fin}).`,
                solicitudId: created?.id || null,
                excludeUserId: req.user.id,
            });

            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando solicitud de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo crear la solicitud de vacaciones.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch((error) => console.error('Error liberando lock de vacaciones:', error));
        }
    }

    async cancelOwn(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();

            const id = Number(req.params.id);
            const current = await VacacionesModel.getById(id);
            if (!current || Number(current.empleado_id) !== Number(req.user.id) || current.estado !== 'pendiente') {
                return res.status(400).json({ error: 'Solo puedes cancelar solicitudes pendientes y propias.' });
            }

            const requestYear = resolveYear(current.fecha_inicio);
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(requestYear);
            const annualConfig = await VacacionesModel.getAnnualConfig(requestYear);
            if (annualConfig.cerrado) {
                return res.status(409).json({ error: `El ejercicio ${requestYear} está cerrado. Contacta con RRHH si necesitas realizar una corrección.` });
            }
            const canceled = await VacacionesModel.cancelByEmployee({ id, empleadoId: req.user.id });

            if (!canceled) {
                return res.status(409).json({ error: 'La solicitud ha cambiado mientras la estabas cancelando. Recarga y revisa su estado.' });
            }

            await safeAudit(req, {
                accion: 'solicitud_cancelada_empleado',
                entidadTipo: 'solicitud',
                entidadId: canceled.id,
                empleadoId: req.user.id,
                year: resolveYear(canceled.fecha_inicio),
                detalle: { estado_anterior: 'pendiente' },
            });
            await safeNotifyManagers({
                tipo: 'solicitud_cancelada',
                titulo: 'Solicitud cancelada por el empleado',
                mensaje: `${canceled.empleado_nombre || 'Un empleado'} ha cancelado una solicitud pendiente.`,
                solicitudId: canceled.id,
                excludeUserId: req.user.id,
            });

            return res.json(canceled);
        } catch (error) {
            console.error('Error cancelando solicitud de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cancelar la solicitud.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch((error) => console.error('Error liberando lock de vacaciones:', error));
        }
    }

    async updateStatus(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();

            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH/administración puede aprobar o rechazar solicitudes.' });
            }

            const id = Number(req.params.id);
            const {
                estado,
                comentario_rrhh,
                forzar_excepcion = false,
                motivo_excepcion = '',
            } = req.body || {};

            if (!['aprobada', 'rechazada', 'pendiente', 'cancelada'].includes(estado)) {
                return res.status(400).json({ error: 'Estado inválido.' });
            }

            let current = await VacacionesModel.getById(id);
            if (!current) {
                return res.status(404).json({ error: 'Solicitud no encontrada.' });
            }

            const requestYear = resolveYear(current.fecha_inicio);
            const yearConfigBeforeLock = await VacacionesModel.getAnnualConfig(requestYear);
            if (yearConfigBeforeLock.cerrado) {
                return res.status(409).json({ error: `El ejercicio ${requestYear} está cerrado. Reábrelo desde Configuración antes de modificar solicitudes.` });
            }
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(requestYear);
            current = await VacacionesModel.getById(id);
            if (!current) {
                return res.status(404).json({ error: 'Solicitud no encontrada.' });
            }

            if (current.estado === 'cancelada') {
                return res.status(400).json({ error: 'No puedes modificar una solicitud cancelada por el empleado.' });
            }

            let exceptionApplied = false;
            let capacityConflicts = [];
            if (estado === 'aprobada') {
                const endpointError = validateVacationEndpoints(normalizeDateKey(current.fecha_inicio), normalizeDateKey(current.fecha_fin));
                if (endpointError) {
                    return res.status(409).json({ error: `No se puede aprobar: ${endpointError}` });
                }

                const year = requestYear;
                const annualConfig = await VacacionesModel.getAnnualConfig(year);
                const blockedWeek = await VacacionesModel.isBlockedWeek({
                    fecha_inicio: current.fecha_inicio,
                    fecha_fin: current.fecha_fin,
                    departamento: current.departamento,
                });
                if (blockedWeek) {
                    return res.status(409).json({ error: `No se puede aprobar: existe un bloqueo activo${blockedWeek.motivo ? ` (${blockedWeek.motivo})` : ''}. Los bloqueos no pueden saltarse con una excepción de cupo.` });
                }

                const balanceProjection = await getBalanceProjection({
                    empleadoId: current.empleado_id,
                    year,
                    annualConfig,
                    fechaInicio: current.fecha_inicio,
                    fechaFin: current.fecha_fin,
                    diasSolicitados: Number(current.dias_solicitados || 0),
                    excludeRequestId: current.id,
                    createdBy: req.user.id,
                });
                if (!balanceProjection.ok) {
                    return res.status(409).json({ error: 'No se puede aprobar: el saldo del empleado ha cambiado y ya no cubre la solicitud.' });
                }

                capacityConflicts = await getCapacityConflicts({
                    departamento: current.departamento,
                    role: current.empleado_role,
                    fechaInicio: current.fecha_inicio,
                    fechaFin: current.fecha_fin,
                    excludeRequestId: current.id,
                });

                if (capacityConflicts.length > 0 && !forzar_excepcion) {
                    return res.status(409).json({
                        error: 'No se puede aprobar: se supera un límite de cobertura. RRHH puede autorizar una excepción justificada.',
                        code: 'CAPACITY_CONFLICT',
                        conflicts: capacityConflicts,
                    });
                }

                if (capacityConflicts.length > 0 && forzar_excepcion) {
                    if (String(motivo_excepcion || '').trim().length < 5) {
                        return res.status(400).json({ error: 'Para autorizar una excepción debes indicar un motivo de al menos 5 caracteres.' });
                    }
                    exceptionApplied = true;
                }
            }

            const previousStatus = current.estado;
            const updated = await VacacionesModel.updateStatus({
                id,
                estado,
                comentario_rrhh,
                revisado_por: req.user.id,
                excepcion_aprobada: exceptionApplied,
                excepcion_motivo: exceptionApplied ? String(motivo_excepcion).trim() : null,
                excepcion_por: exceptionApplied ? req.user.id : null,
            });

            await safeAudit(req, {
                accion: 'solicitud_estado_actualizado',
                entidadTipo: 'solicitud',
                entidadId: id,
                empleadoId: current.empleado_id,
                year: requestYear,
                detalle: {
                    estado_anterior: previousStatus,
                    estado_nuevo: estado,
                    comentario_rrhh: comentario_rrhh || null,
                    excepcion_cupo: exceptionApplied,
                    motivo_excepcion: exceptionApplied ? String(motivo_excepcion).trim() : null,
                    conflictos_cupo: exceptionApplied ? capacityConflicts : [],
                },
            });

            const statusLabel = estado === 'aprobada' ? 'aprobada' : estado === 'rechazada' ? 'rechazada' : estado === 'cancelada' ? 'cancelada por RRHH' : 'puesta de nuevo como pendiente';
            await safeNotifyUser({
                usuarioId: current.empleado_id,
                tipo: `solicitud_${estado}`,
                titulo: `Solicitud de vacaciones ${statusLabel}`,
                mensaje: `Tu solicitud del ${normalizeDateKey(current.fecha_inicio)} al ${normalizeDateKey(current.fecha_fin)} ha sido ${statusLabel}.${comentario_rrhh ? ` Comentario de RRHH: ${comentario_rrhh}` : ''}`,
                solicitudId: id,
            });

            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando estado de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch((error) => console.error('Error liberando lock de vacaciones:', error));
        }
    }

    async stats(req, res) {
        try {
            await VacacionesModel.ensureTable();

            const stats = await VacacionesModel.getStats({
                requesterId: req.user.id,
                requesterRole: req.user.role,
                year: req.query.year,
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
            const targetYear = resolveYear(fecha);
            const yearConfig = await VacacionesModel.getAnnualConfig(targetYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${targetYear} está cerrado. Reábrelo antes de modificar festivos/no laborables.` });

            const created = await VacacionesModel.createNonWorkingDay({ fecha, descripcion, ambito });
            await safeAudit(req, { accion: 'dia_no_laborable_creado', entidadTipo: 'dia_no_laborable', entidadId: created?.id || null, year: resolveYear(fecha), detalle: { fecha, descripcion: descripcion || null, ambito: ambito || null } });
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
            const current = await VacacionesModel.getNonWorkingDayById(id);
            if (!current) return res.status(404).json({ error: 'Día no laborable no encontrado.' });
            const targetYear = resolveYear(current.fecha);
            const yearConfig = await VacacionesModel.getAnnualConfig(targetYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${targetYear} está cerrado. Reábrelo antes de modificar festivos/no laborables.` });
            const updated = await VacacionesModel.toggleNonWorkingDay({ id, activa: req.body?.activa });
            if (!updated) return res.status(404).json({ error: 'Día no laborable no encontrado.' });
            await safeAudit(req, { accion: updated.activa ? 'dia_no_laborable_activado' : 'dia_no_laborable_desactivado', entidadTipo: 'dia_no_laborable', entidadId: updated.id, year: resolveYear(updated.fecha), detalle: { fecha: normalizeDateKey(updated.fecha), activa: updated.activa } });

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
            const current = await VacacionesModel.getNonWorkingDayById(id);
            if (!current) return res.status(404).json({ error: 'Día no laborable no encontrado.' });
            const targetYear = resolveYear(current.fecha);
            const yearConfig = await VacacionesModel.getAnnualConfig(targetYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${targetYear} está cerrado. Reábrelo antes de modificar festivos/no laborables.` });
            const deleted = await VacacionesModel.deleteNonWorkingDay(id);
            if (!deleted) return res.status(404).json({ error: 'Día no laborable no encontrado.' });
            await safeAudit(req, { accion: 'dia_no_laborable_eliminado', entidadTipo: 'dia_no_laborable', entidadId: id, year: targetYear, detalle: { fecha: normalizeDateKey(current.fecha), descripcion: current.descripcion || null, ambito: current.ambito || null } });

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
                year: req.query.year,
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
            const startYear = resolveYear(fecha_inicio);
            const endYear = resolveYear(fecha_fin);
            if (startYear !== endYear) return res.status(400).json({ error: 'Un bloqueo no puede cruzar dos ejercicios. Crea un bloqueo independiente para cada año.' });
            const yearConfig = await VacacionesModel.getAnnualConfig(startYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${startYear} está cerrado. Reábrelo antes de modificar bloqueos.` });

            const created = await VacacionesModel.createBlockedWeek({ departamento, fecha_inicio, fecha_fin, motivo });
            await safeAudit(req, { accion: 'bloqueo_creado', entidadTipo: 'bloqueo', entidadId: created?.id || null, year: resolveYear(fecha_inicio), detalle: { departamento: departamento || null, fecha_inicio, fecha_fin, motivo: motivo || null } });
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
            const current = await VacacionesModel.getBlockedWeekById(id);
            if (!current) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });
            const targetYear = resolveYear(current.fecha_inicio);
            const yearConfig = await VacacionesModel.getAnnualConfig(targetYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${targetYear} está cerrado. Reábrelo antes de modificar bloqueos.` });
            const updated = await VacacionesModel.toggleBlockedWeek({ id, activa: req.body?.activa });
            if (!updated) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });
            await safeAudit(req, { accion: updated.activa ? 'bloqueo_activado' : 'bloqueo_desactivado', entidadTipo: 'bloqueo', entidadId: updated.id, year: resolveYear(updated.fecha_inicio), detalle: { activa: updated.activa } });

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
            const current = await VacacionesModel.getBlockedWeekById(id);
            if (!current) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });
            const targetYear = resolveYear(current.fecha_inicio);
            const yearConfig = await VacacionesModel.getAnnualConfig(targetYear);
            if (yearConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${targetYear} está cerrado. Reábrelo antes de modificar bloqueos.` });
            const deleted = await VacacionesModel.deleteBlockedWeek(id);
            if (!deleted) return res.status(404).json({ error: 'Semana bloqueada no encontrada.' });
            await safeAudit(req, { accion: 'bloqueo_eliminado', entidadTipo: 'bloqueo', entidadId: id, year: targetYear, detalle: { departamento: current.departamento || null, fecha_inicio: normalizeDateKey(current.fecha_inicio), fecha_fin: normalizeDateKey(current.fecha_fin), motivo: current.motivo || null } });

            return res.status(204).send();
        } catch (error) {
            console.error('Error eliminando semana bloqueada:', error);
            return res.status(500).json({ error: 'No se pudo eliminar la semana bloqueada.' });
        }
    }

    async availability(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role) && !(await VacacionesModel.isVacationParticipant(req.user.id))) {
                return res.status(403).json({ error: 'Tu cuenta no está incluida en la gestión de vacaciones.' });
            }
            const { from, to } = req.query;
            const fromDate = new Date(from);
            const toDate = new Date(to);
            if (!from || !to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
                return res.status(400).json({ error: 'Rango de calendario inválido.' });
            }

            const ownDepartment = await VacacionesModel.getUserDepartment({
                userId: req.user.id,
                fallbackRole: req.user.role || 'general',
            });

            const managerMode = canManage(req.user.role);
            const departamento = managerMode
                ? String(req.query.departamento || '').trim()
                : ownDepartment;
            const role = managerMode
                ? String(req.query.role || '').trim()
                : (req.user.role || '');

            const mandatoryDates = [];
            const startYear = fromDate.getFullYear();
            const endYear = toDate.getFullYear();
            for (let year = startYear; year <= endYear; year += 1) {
                const config = await VacacionesModel.getAnnualConfig(year);
                mandatoryDates.push(...buildMandatoryDates(year, config));
            }

            const rows = await VacacionesModel.getAvailabilityCalendar({
                requesterId: managerMode ? null : req.user.id,
                departamento,
                role,
                fecha_inicio: from,
                fecha_fin: to,
                mandatoryDates,
            });

            return res.json({ departamento, role, days: rows });
        } catch (error) {
            console.error('Error obteniendo disponibilidad de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cargar la disponibilidad del calendario.' });
        }
    }

    async listCapacityRules(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar los cupos.' });
            return res.json(await VacacionesModel.listCapacityRules());
        } catch (error) {
            console.error('Error listando reglas de cupo:', error);
            return res.status(500).json({ error: 'No se pudieron cargar las reglas de cupo.' });
        }
    }

    async createCapacityRule(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar los cupos.' });
            const { tipo, valor, max_personas, descripcion } = req.body || {};
            const maxPersonas = Number(max_personas);
            if (
                !['departamento', 'rol'].includes(tipo)
                || !String(valor || '').trim()
                || !Number.isInteger(maxPersonas)
                || maxPersonas < 1
                || maxPersonas > 100
            ) {
                return res.status(400).json({ error: 'Indica tipo, grupo y un máximo de personas válido entre 1 y 100.' });
            }
            const created = await VacacionesModel.createCapacityRule({ tipo, valor, max_personas: maxPersonas, descripcion });
            await safeAudit(req, { accion: 'regla_cupo_guardada', entidadTipo: 'regla_cupo', entidadId: created?.id || null, detalle: { tipo, valor: String(valor).trim(), max_personas: maxPersonas, descripcion: descripcion || null } });
            return res.status(201).json(created);
        } catch (error) {
            console.error('Error guardando regla de cupo:', error);
            return res.status(500).json({ error: 'No se pudo guardar la regla de cupo.' });
        }
    }

    async toggleCapacityRule(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar los cupos.' });
            const updated = await VacacionesModel.toggleCapacityRule({ id: Number(req.params.id), activa: req.body?.activa });
            if (!updated) return res.status(404).json({ error: 'Regla de cupo no encontrada.' });
            await safeAudit(req, { accion: updated.activa ? 'regla_cupo_activada' : 'regla_cupo_desactivada', entidadTipo: 'regla_cupo', entidadId: updated.id, detalle: { tipo: updated.tipo, valor: updated.valor, activa: updated.activa } });
            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando regla de cupo:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la regla de cupo.' });
        }
    }

    async deleteCapacityRule(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar los cupos.' });
            const ruleId = Number(req.params.id);
            const deleted = await VacacionesModel.deleteCapacityRule(ruleId);
            if (!deleted) return res.status(404).json({ error: 'Regla de cupo no encontrada.' });
            await safeAudit(req, { accion: 'regla_cupo_eliminada', entidadTipo: 'regla_cupo', entidadId: ruleId, detalle: {} });
            return res.status(204).send();
        } catch (error) {
            console.error('Error eliminando regla de cupo:', error);
            return res.status(500).json({ error: 'No se pudo eliminar la regla de cupo.' });
        }
    }


    async getYearConfig(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const year = Number(req.params.year);
            if (!Number.isInteger(year) || year < 2000 || year > 2200) {
                return res.status(400).json({ error: 'Año inválido.' });
            }

            const config = await VacacionesModel.getAnnualConfig(year);
            if (!canManage(req.user.role)) return res.json(config);

            const cupos = await VacacionesModel.getAnnualAllowanceSnapshotStats(year);
            const arrastreEntrada = await VacacionesModel.getCarryoverStats({ targetYear: year });
            const arrastreSalida = await VacacionesModel.getCarryoverStats({ sourceYear: year });
            return res.json({ ...config, cupos_anuales: cupos, arrastre_entrada: arrastreEntrada, arrastre_salida: arrastreSalida });
        } catch (error) {
            console.error('Error obteniendo configuración anual de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cargar la configuración anual.' });
        }
    }

    async updateYearConfig(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede modificar la configuración anual.' });

            const year = Number(req.params.year);
            const diasBase = Number(req.body?.dias_base_default);
            const notice = Number(req.body?.antelacion_minima_dias);
            const maxConsecutive = Number(req.body?.max_dias_consecutivos);
            const arrastrePermitido = Boolean(req.body?.arrastre_permitido);
            const arrastreMaxDias = Number(req.body?.arrastre_max_dias || 0);
            const arrastreLimiteMmdd = String(req.body?.arrastre_limite_mmdd || '03-31').trim();
            const rawMandatoryDates = Array.isArray(req.body?.fechas_obligatorias)
                ? [...new Set(req.body.fechas_obligatorias.map((value) => String(value || '').trim()).filter(Boolean))]
                : [];

            if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error: 'Año inválido.' });
            const invalidMandatoryDate = rawMandatoryDates.find((value) => !isValidMmDd(value, year));
            if (invalidMandatoryDate) {
                return res.status(400).json({ error: `Fecha obligatoria inválida: ${invalidMandatoryDate}. Usa un día real del calendario.` });
            }
            const mandatoryDates = rawMandatoryDates;
            if (!Number.isFinite(diasBase) || diasBase < 0 || diasBase > 365) return res.status(400).json({ error: 'Los días base deben estar entre 0 y 365.' });
            if (!Number.isInteger(notice) || notice < 0 || notice > 365) return res.status(400).json({ error: 'La antelación mínima debe estar entre 0 y 365 días.' });
            if (!Number.isInteger(maxConsecutive) || maxConsecutive < 1 || maxConsecutive > 365) return res.status(400).json({ error: 'El máximo consecutivo debe estar entre 1 y 365 días.' });
            if (mandatoryDates.length > diasBase) return res.status(400).json({ error: 'No puede haber más días obligatorios que días base.' });
            if (!Number.isFinite(arrastreMaxDias) || arrastreMaxDias < 0 || arrastreMaxDias > 365) return res.status(400).json({ error: 'El máximo de arrastre debe estar entre 0 y 365 días.' });
            if (!isValidMmDd(arrastreLimiteMmdd, year + 1)) return res.status(400).json({ error: 'La fecha límite del arrastre no es válida.' });

            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);

            const currentConfig = await VacacionesModel.getAnnualConfig(year);
            if (currentConfig.cerrado) {
                return res.status(409).json({ error: `El ejercicio ${year} está cerrado. Reábrelo antes de modificar su configuración.` });
            }

            const wantsOpen = req.body?.permitir_solicitudes !== false;
            if (wantsOpen && !currentConfig.permitir_solicitudes) {
                const readiness = await VacacionesModel.getYearReadiness(year);
                if (!readiness.can_open) {
                    return res.status(409).json({
                        error: `No se puede abrir ${year}: revisa primero los datos críticos de preparación.`,
                        code: 'YEAR_NOT_READY',
                        readiness,
                    });
                }
            }

            const updated = await VacacionesModel.updateAnnualConfig({
                year,
                dias_base_default: diasBase,
                antelacion_minima_dias: notice,
                max_dias_consecutivos: maxConsecutive,
                fechas_obligatorias: mandatoryDates,
                permitir_solicitudes: wantsOpen,
                notas: String(req.body?.notas || '').trim(),
                arrastre_permitido: arrastrePermitido,
                arrastre_max_dias: arrastreMaxDias,
                arrastre_limite_mmdd: arrastreLimiteMmdd,
                updated_by: req.user.id,
            });

            let cupos;
            if (updated.permitir_solicitudes) {
                cupos = await VacacionesModel.snapshotAnnualAllowances({
                    year,
                    fallbackAllowance: updated.dias_base_default,
                    createdBy: req.user.id,
                });
            } else {
                cupos = await VacacionesModel.getAnnualAllowanceSnapshotStats(year);
            }

            await safeAudit(req, {
                accion: 'configuracion_anual_actualizada',
                entidadTipo: 'ejercicio',
                entidadId: year,
                year,
                detalle: {
                    dias_base_default: updated.dias_base_default,
                    antelacion_minima_dias: updated.antelacion_minima_dias,
                    max_dias_consecutivos: updated.max_dias_consecutivos,
                    fechas_obligatorias: updated.fechas_obligatorias,
                    permitir_solicitudes: updated.permitir_solicitudes,
                    arrastre_permitido: updated.arrastre_permitido,
                    arrastre_max_dias: updated.arrastre_max_dias,
                    arrastre_limite_mmdd: updated.arrastre_limite_mmdd,
                },
            });

            const arrastreEntrada = await VacacionesModel.getCarryoverStats({ targetYear: year });
            const arrastreSalida = await VacacionesModel.getCarryoverStats({ sourceYear: year });
            return res.json({ ...updated, cupos_anuales: cupos, arrastre_entrada: arrastreEntrada, arrastre_salida: arrastreSalida });
        } catch (error) {
            console.error('Error actualizando configuración anual de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo guardar la configuración anual.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch((error) => console.error('Error liberando lock de configuración anual:', error));
        }
    }


    async listAdjustments(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH puede consultar ajustes de vacaciones.' });
            }

            const year = req.query.year ? Number(req.query.year) : undefined;
            const empleadoId = req.query.empleadoId ? Number(req.query.empleadoId) : undefined;

            const rows = await VacacionesModel.listAdjustments({ year, empleadoId });
            return res.json(rows);
        } catch (error) {
            console.error('Error listando ajustes de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudieron cargar los ajustes de vacaciones.' });
        }
    }

    async createAdjustment(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH puede modificar el saldo de vacaciones.' });
            }

            const empleado_id = Number(req.body?.empleado_id);
            const year = Number(req.body?.year);
            const dias = Number(req.body?.dias);
            const tipo = String(req.body?.tipo || 'correccion').trim().toLowerCase();
            const motivo = String(req.body?.motivo || '').trim();

            if (!Number.isInteger(empleado_id) || empleado_id <= 0) {
                return res.status(400).json({ error: 'Selecciona un empleado válido.' });
            }
            if (!Number.isInteger(year) || year < 2000 || year > 2200) {
                return res.status(400).json({ error: 'Año inválido.' });
            }
            if (!Number.isFinite(dias) || dias === 0 || Math.abs(dias) > 365) {
                return res.status(400).json({ error: 'El ajuste debe ser distinto de 0 y estar entre -365 y 365 días.' });
            }
            if (!(await VacacionesModel.isVacationParticipant(empleado_id))) {
                return res.status(400).json({ error: 'Ese usuario no participa actualmente en el sistema de vacaciones.' });
            }

            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const annualConfig = await VacacionesModel.getAnnualConfig(year);
            if (annualConfig.cerrado) {
                return res.status(409).json({ error: `El ejercicio ${year} está cerrado. Reábrelo antes de modificar saldos.` });
            }

            const created = await VacacionesModel.createAdjustment({
                empleado_id,
                year,
                tipo,
                dias,
                motivo,
                created_by: req.user.id,
            });

            await safeAudit(req, {
                accion: 'ajuste_saldo_creado',
                entidadTipo: 'ajuste',
                entidadId: created?.id || null,
                empleadoId: empleado_id,
                year,
                detalle: { tipo, dias, motivo: motivo || null },
            });
            await safeNotifyUser({
                usuarioId: empleado_id,
                tipo: 'ajuste_saldo',
                titulo: 'Tu saldo de vacaciones ha sido ajustado',
                mensaje: `RRHH ha aplicado un ajuste de ${dias > 0 ? '+' : ''}${dias} día${Math.abs(dias) === 1 ? '' : 's'} en ${year}${motivo ? `: ${motivo}` : '.'}`,
            });

            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando ajuste de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo guardar el ajuste de vacaciones.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

    async deleteAdjustment(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) {
                return res.status(403).json({ error: 'Solo RRHH puede eliminar ajustes de vacaciones.' });
            }

            const id = Number(req.params.id);
            const current = await VacacionesModel.getAdjustmentById(id);
            if (!current) return res.status(404).json({ error: 'Ajuste no encontrado.' });
            const year = Number(current.year);
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const annualConfig = await VacacionesModel.getAnnualConfig(year);
            if (annualConfig.cerrado) {
                return res.status(409).json({ error: `El ejercicio ${year} está cerrado. Reábrelo antes de eliminar ajustes.` });
            }

            const deleted = await VacacionesModel.deleteAdjustment(id);
            if (!deleted) return res.status(404).json({ error: 'Ajuste no encontrado.' });
            await safeAudit(req, {
                accion: 'ajuste_saldo_eliminado',
                entidadTipo: 'ajuste',
                entidadId: id,
                empleadoId: current.empleado_id,
                year,
                detalle: { tipo: current.tipo, dias: Number(current.dias || 0), motivo: current.motivo || null },
            });
            await safeNotifyUser({
                usuarioId: current.empleado_id,
                tipo: 'ajuste_saldo_eliminado',
                titulo: 'Se ha corregido un ajuste de vacaciones',
                mensaje: `RRHH ha eliminado un ajuste de ${Number(current.dias || 0) > 0 ? '+' : ''}${Number(current.dias || 0)} días del ejercicio ${year}.`,
            });
            return res.status(204).send();
        } catch (error) {
            console.error('Error eliminando ajuste de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo eliminar el ajuste de vacaciones.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

    async capacityGroups(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede consultar los grupos de cupo.' });
            return res.json(await VacacionesModel.getCapacityGroups());
        } catch (error) {
            console.error('Error obteniendo grupos de cupo:', error);
            return res.status(500).json({ error: 'No se pudieron cargar los grupos de empleados.' });
        }
    }

    async listParticipants(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar quién participa en vacaciones.' });
            return res.json(await VacacionesModel.listParticipants());
        } catch (error) {
            console.error('Error listando participantes de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cargar la configuración de empleados.' });
        }
    }

    async updateParticipant(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede gestionar el acceso y la participación en vacaciones.' });

            const empleadoId = Number(req.params.empleadoId);
            if (!Number.isInteger(empleadoId) || empleadoId <= 0) return res.status(400).json({ error: 'Empleado inválido.' });

            const current = await VacacionesModel.getVacationUserSettings(empleadoId);
            if (!current) return res.status(404).json({ error: 'Usuario no encontrado.' });

            const hasParticipa = Object.prototype.hasOwnProperty.call(req.body || {}, 'participa');
            const hasAccess = Object.prototype.hasOwnProperty.call(req.body || {}, 'acceso_modulo');
            const hasNotas = Object.prototype.hasOwnProperty.call(req.body || {}, 'notas');

            if (!hasParticipa && !hasAccess && !hasNotas) {
                return res.status(400).json({ error: 'No se ha indicado ningún cambio.' });
            }

            const participa = hasParticipa ? req.body.participa !== false : null;
            const accesoModulo = hasAccess ? req.body.acceso_modulo !== false : null;
            const notas = hasNotas ? String(req.body?.notas || '').trim() : null;

            if (hasAccess && accesoModulo === false && String(current.role || '').toLowerCase() === 'admin') {
                return res.status(400).json({ error: 'El acceso al módulo no puede desactivarse para un administrador. Así siempre habrá una cuenta capaz de recuperar la configuración.' });
            }

            if (hasParticipa && participa === false && current.participa !== false) {
                const commitments = await VacacionesModel.getParticipantOpenCommitments(empleadoId);
                const total = commitments.pendientes + commitments.aprobadas_futuras;
                if (total > 0) {
                    return res.status(409).json({
                        error: `No puedes excluir a este empleado mientras tenga ${commitments.pendientes} solicitud${commitments.pendientes === 1 ? '' : 'es'} pendiente${commitments.pendientes === 1 ? '' : 's'} y ${commitments.aprobadas_futuras} ausencia${commitments.aprobadas_futuras === 1 ? '' : 's'} aprobada${commitments.aprobadas_futuras === 1 ? '' : 's'} futura${commitments.aprobadas_futuras === 1 ? '' : 's'}. Resuélvelas o cancélalas primero.`
                    });
                }
            }

            const updated = await VacacionesModel.updateParticipant({
                empleadoId,
                participa,
                accesoModulo,
                notas,
                updatedBy: req.user.id,
            });

            if (hasParticipa && Boolean(current.participa) !== Boolean(updated.participa)) {
                await safeAudit(req, {
                    accion: updated.participa ? 'empleado_incluido' : 'empleado_excluido',
                    entidadTipo: 'participante',
                    entidadId: empleadoId,
                    empleadoId,
                    year: new Date().getFullYear(),
                    detalle: { participa: updated.participa, notas: updated.notas || null },
                });
            }

            if (hasAccess && Boolean(current.acceso_modulo) !== Boolean(updated.acceso_modulo)) {
                await safeAudit(req, {
                    accion: updated.acceso_modulo ? 'acceso_modulo_concedido' : 'acceso_modulo_retirado',
                    entidadTipo: 'acceso_modulo',
                    entidadId: empleadoId,
                    empleadoId,
                    year: new Date().getFullYear(),
                    detalle: { acceso_modulo: updated.acceso_modulo },
                });
            }

            return res.json(updated);
        } catch (error) {
            console.error('Error actualizando acceso/participación de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la configuración del empleado.' });
        }
    }

    async listAudit(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede consultar la auditoría.' });
            const year = req.query.year ? Number(req.query.year) : null;
            const empleadoId = req.query.empleadoId ? Number(req.query.empleadoId) : null;
            return res.json(await VacacionesModel.listAudit({ year, empleadoId, limit: req.query.limit }));
        } catch (error) {
            console.error('Error listando auditoría de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cargar el historial de actividad.' });
        }
    }

    async listNotifications(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const rows = await VacacionesModel.listNotifications({
                userId: req.user.id,
                unreadOnly: req.query.unreadOnly === 'true',
                limit: req.query.limit,
            });
            return res.json(rows);
        } catch (error) {
            console.error('Error listando notificaciones de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudieron cargar las notificaciones.' });
        }
    }

    async markNotificationRead(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const updated = await VacacionesModel.markNotificationRead({ id: Number(req.params.id), userId: req.user.id });
            if (!updated) return res.status(404).json({ error: 'Notificación no encontrada.' });
            return res.json(updated);
        } catch (error) {
            console.error('Error marcando notificación:', error);
            return res.status(500).json({ error: 'No se pudo actualizar la notificación.' });
        }
    }

    async markAllNotificationsRead(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const updated = await VacacionesModel.markAllNotificationsRead(req.user.id);
            return res.json({ updated });
        } catch (error) {
            console.error('Error marcando notificaciones:', error);
            return res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
        }
    }

    async managerCreateRequest(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede crear vacaciones en nombre de un empleado.' });

            const empleadoId = Number(req.body?.empleado_id);
            const fechaInicio = String(req.body?.fecha_inicio || '').slice(0, 10);
            const fechaFin = String(req.body?.fecha_fin || '').slice(0, 10);
            const motivo = String(req.body?.motivo || '').trim();
            const estadoInicial = req.body?.estado_inicial === 'pendiente' ? 'pendiente' : 'aprobada';
            const forceException = Boolean(req.body?.forzar_excepcion);
            const exceptionReason = String(req.body?.motivo_excepcion || '').trim();

            const employee = await VacacionesModel.getEmployeeProfile(empleadoId);
            if (!employee) return res.status(404).json({ error: 'Empleado no encontrado.' });
            if (employee.participa === false) return res.status(409).json({ error: 'Ese usuario no participa actualmente en Vacaciones.' });

            const start = new Date(fechaInicio);
            const end = new Date(fechaFin);
            if (!fechaInicio || !fechaFin || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
                return res.status(400).json({ error: 'Rango de fechas inválido.' });
            }
            if (start.getFullYear() !== end.getFullYear()) {
                return res.status(400).json({ error: 'La ausencia no puede cruzar dos ejercicios. Crea una solicitud por año.' });
            }

            const endpointError = validateVacationEndpoints(fechaInicio, fechaFin);
            if (endpointError) return res.status(400).json({ error: endpointError });

            const year = start.getFullYear();
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const annualConfig = await VacacionesModel.getAnnualConfig(year);
            if (annualConfig.cerrado) return res.status(409).json({ error: `El ejercicio ${year} está cerrado. Reábrelo antes de registrar vacaciones.` });

            const days = await getWorkingDays(fechaInicio, fechaFin, annualConfig);
            if (days <= 0) return res.status(400).json({ error: 'El rango no contiene días laborables seleccionables.' });
            if (days > Number(annualConfig.max_dias_consecutivos || 30)) {
                return res.status(400).json({ error: `El rango supera el máximo de ${annualConfig.max_dias_consecutivos} días laborables por solicitud.` });
            }

            const blocked = await VacacionesModel.isBlockedWeek({
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                departamento: employee.departamento,
            });
            if (blocked) return res.status(409).json({ error: `El rango coincide con un bloqueo activo${blocked.motivo ? `: ${blocked.motivo}` : ''}.` });

            const overlap = await VacacionesModel.hasDateOverlap({
                empleado_id: empleadoId,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
            });
            if (overlap) return res.status(409).json({ error: 'El empleado ya tiene otra solicitud pendiente o aprobada en ese rango.' });

            const balance = await getBalanceProjection({
                empleadoId,
                year,
                annualConfig,
                fechaInicio,
                fechaFin,
                diasSolicitados: days,
                createdBy: req.user.id,
            });
            if (!balance.ok) return res.status(409).json({ error: `El empleado no tiene saldo suficiente para esas fechas. Disponible compatible: ${balance.available} días.` });

            const conflicts = await getCapacityConflicts({
                departamento: employee.departamento,
                role: employee.role,
                fechaInicio,
                fechaFin,
            });
            if (conflicts.length && !forceException) {
                return res.status(409).json({
                    error: 'La ausencia supera un límite de cobertura. Puedes autorizar una excepción justificada.',
                    code: 'CAPACITY_CONFLICT',
                    conflicts,
                });
            }
            if (conflicts.length && forceException && exceptionReason.length < 5) {
                return res.status(400).json({ error: 'Indica un motivo de al menos 5 caracteres para autorizar la excepción.' });
            }

            const created = await VacacionesModel.create({
                input: {
                    empleado_id: empleadoId,
                    empleado_nombre: employee.empleado_nombre,
                    departamento: employee.departamento,
                    empleado_role: employee.role,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    dias_solicitados: days,
                    motivo,
                    estado: estadoInicial,
                    origen: 'rrhh',
                    revisado_por: estadoInicial === 'aprobada' ? req.user.id : null,
                    excepcion_aprobada: conflicts.length > 0 && forceException,
                    excepcion_motivo: conflicts.length > 0 && forceException ? exceptionReason : null,
                    excepcion_por: conflicts.length > 0 && forceException ? req.user.id : null,
                },
            });

            await safeAudit(req, {
                accion: 'solicitud_creada_rrhh',
                entidadTipo: 'solicitud',
                entidadId: created.id,
                empleadoId,
                year,
                detalle: {
                    estado: estadoInicial,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    dias: days,
                    excepcion_cupo: conflicts.length > 0 && forceException,
                    motivo_excepcion: conflicts.length > 0 && forceException ? exceptionReason : null,
                },
            });
            await safeNotifyUser({
                usuarioId: empleadoId,
                tipo: 'solicitud_rrhh',
                titulo: estadoInicial === 'aprobada' ? 'Vacaciones registradas por RRHH' : 'Solicitud registrada por RRHH',
                mensaje: `RRHH ha registrado ${days} día${days === 1 ? '' : 's'} del ${fechaInicio} al ${fechaFin}${motivo ? ` (${motivo})` : ''}.`,
                solicitudId: created.id,
            });

            return res.status(201).json(created);
        } catch (error) {
            console.error('Error creando vacaciones desde RRHH:', error);
            return res.status(500).json({ error: 'No se pudieron registrar las vacaciones del empleado.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

    async createChangeRequest(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const solicitudId = Number(req.params.id);
            const current = await VacacionesModel.getById(solicitudId);
            if (!current || Number(current.empleado_id) !== Number(req.user.id)) {
                return res.status(404).json({ error: 'Solicitud no encontrada.' });
            }
            if (current.estado !== 'aprobada') {
                return res.status(409).json({ error: 'Solo puedes pedir cambios sobre vacaciones aprobadas.' });
            }

            const year = resolveYear(current.fecha_inicio);
            const config = await VacacionesModel.getAnnualConfig(year);
            if (config.cerrado) return res.status(409).json({ error: `El ejercicio ${year} está cerrado.` });

            const tipo = req.body?.tipo === 'cancelacion' ? 'cancelacion' : 'modificacion';
            const motivo = String(req.body?.motivo || '').trim();
            if (motivo.length < 3) return res.status(400).json({ error: 'Indica brevemente el motivo del cambio.' });

            let fechaInicioNueva = null;
            let fechaFinNueva = null;
            let diasNuevos = null;

            if (tipo === 'modificacion') {
                fechaInicioNueva = String(req.body?.fecha_inicio_nueva || '').slice(0, 10);
                fechaFinNueva = String(req.body?.fecha_fin_nueva || '').slice(0, 10);
                const start = new Date(fechaInicioNueva);
                const end = new Date(fechaFinNueva);
                if (!fechaInicioNueva || !fechaFinNueva || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
                    return res.status(400).json({ error: 'Las nuevas fechas no son válidas.' });
                }
                if (start.getFullYear() !== year || end.getFullYear() !== year) {
                    return res.status(400).json({ error: `El cambio debe mantenerse dentro del ejercicio ${year}.` });
                }
                const endpointError = validateVacationEndpoints(fechaInicioNueva, fechaFinNueva);
                if (endpointError) return res.status(400).json({ error: endpointError });
                diasNuevos = await getWorkingDays(fechaInicioNueva, fechaFinNueva, config);
                if (diasNuevos <= 0) return res.status(400).json({ error: 'El nuevo rango no contiene días laborables seleccionables.' });

                const overlap = await VacacionesModel.hasDateOverlap({
                    empleado_id: req.user.id,
                    fecha_inicio: fechaInicioNueva,
                    fecha_fin: fechaFinNueva,
                    excludeRequestId: current.id,
                });
                if (overlap) return res.status(409).json({ error: 'Ya tienes otra solicitud pendiente o aprobada que se solapa con esas fechas.' });
            }

            const created = await VacacionesModel.createChangeRequest({
                solicitudId,
                empleadoId: req.user.id,
                tipo,
                fechaInicioNueva,
                fechaFinNueva,
                diasNuevos,
                motivo,
            });

            await safeAudit(req, {
                accion: 'cambio_solicitado_empleado',
                entidadTipo: 'cambio_solicitud',
                entidadId: created.id,
                empleadoId: req.user.id,
                year,
                detalle: { solicitud_id: solicitudId, tipo, fecha_inicio_nueva: fechaInicioNueva, fecha_fin_nueva: fechaFinNueva, motivo },
            });
            await safeNotifyManagers({
                tipo: 'cambio_solicitado',
                titulo: tipo === 'cancelacion' ? 'Solicitud de cancelación de vacaciones' : 'Solicitud de cambio de vacaciones',
                mensaje: `${current.empleado_nombre || 'Un empleado'} solicita ${tipo === 'cancelacion' ? 'cancelar' : 'modificar'} unas vacaciones aprobadas.`,
                solicitudId,
                excludeUserId: req.user.id,
            });

            return res.status(201).json(created);
        } catch (error) {
            if (error?.code === '23505') return res.status(409).json({ error: 'Ya existe una petición de cambio pendiente para esas vacaciones.' });
            console.error('Error creando petición de cambio:', error);
            return res.status(500).json({ error: 'No se pudo registrar la petición de cambio.' });
        }
    }

    async listChangeRequests(req, res) {
        try {
            await VacacionesModel.ensureTable();
            const rows = await VacacionesModel.listChangeRequests({
                requesterId: req.user.id,
                requesterRole: req.user.role,
                year: req.query.year ? Number(req.query.year) : null,
                estado: req.query.estado || null,
            });
            return res.json(rows);
        } catch (error) {
            console.error('Error listando cambios de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudieron cargar las solicitudes de cambio.' });
        }
    }

    async resolveChangeRequest(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede resolver cambios de vacaciones.' });

            const changeId = Number(req.params.id);
            const decision = req.body?.estado === 'rechazada' ? 'rechazada' : 'aprobada';
            const comment = String(req.body?.comentario_rrhh || '').trim();
            const forceException = Boolean(req.body?.forzar_excepcion);
            const exceptionReason = String(req.body?.motivo_excepcion || '').trim();

            let change = await VacacionesModel.getChangeRequestById(changeId);
            if (!change) return res.status(404).json({ error: 'Petición de cambio no encontrada.' });
            if (change.estado !== 'pendiente') return res.status(409).json({ error: 'Esta petición de cambio ya ha sido resuelta.' });

            const year = resolveYear(change.fecha_inicio_actual);
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const config = await VacacionesModel.getAnnualConfig(year);
            if (config.cerrado) return res.status(409).json({ error: `El ejercicio ${year} está cerrado.` });

            change = await VacacionesModel.getChangeRequestById(changeId);
            if (!change || change.solicitud_estado !== 'aprobada') return res.status(409).json({ error: 'Las vacaciones originales ya no están aprobadas.' });

            if (decision === 'rechazada') {
                const rejected = await VacacionesModel.resolveChangeRequest({ id: changeId, estado: 'rechazada', comentarioRrhh: comment, resueltoPor: req.user.id });
                await safeAudit(req, { accion: 'cambio_rechazado', entidadTipo: 'cambio_solicitud', entidadId: changeId, empleadoId: change.empleado_id, year, detalle: { tipo: change.tipo, comentario: comment || null } });
                await safeNotifyUser({ usuarioId: change.empleado_id, tipo: 'cambio_rechazado', titulo: 'Cambio de vacaciones rechazado', mensaje: `RRHH ha rechazado tu petición de ${change.tipo === 'cancelacion' ? 'cancelación' : 'modificación'}.${comment ? ` Motivo: ${comment}` : ''}`, solicitudId: change.solicitud_id });
                return res.json({ cambio: rejected, solicitud: null });
            }

            let affectedRequest = null;
            if (change.tipo === 'cancelacion') {
                affectedRequest = await VacacionesModel.updateStatus({
                    id: change.solicitud_id,
                    estado: 'cancelada',
                    comentario_rrhh: comment || 'Cancelación aprobada a petición del empleado',
                    revisado_por: req.user.id,
                });
            } else {
                const endpointError = validateVacationEndpoints(change.fecha_inicio_nueva, change.fecha_fin_nueva);
                if (endpointError) return res.status(409).json({ error: endpointError });

                const blocked = await VacacionesModel.isBlockedWeek({
                    fecha_inicio: change.fecha_inicio_nueva,
                    fecha_fin: change.fecha_fin_nueva,
                    departamento: change.departamento,
                });
                if (blocked) return res.status(409).json({ error: `Las nuevas fechas coinciden con un bloqueo activo${blocked.motivo ? `: ${blocked.motivo}` : ''}.` });

                const overlap = await VacacionesModel.hasDateOverlap({
                    empleado_id: change.empleado_id,
                    fecha_inicio: change.fecha_inicio_nueva,
                    fecha_fin: change.fecha_fin_nueva,
                    excludeRequestId: change.solicitud_id,
                });
                if (overlap) return res.status(409).json({ error: 'Las nuevas fechas se solapan con otra solicitud del empleado.' });

                const days = await getWorkingDays(change.fecha_inicio_nueva, change.fecha_fin_nueva, config);
                const balance = await getBalanceProjection({
                    empleadoId: change.empleado_id,
                    year,
                    annualConfig: config,
                    fechaInicio: change.fecha_inicio_nueva,
                    fechaFin: change.fecha_fin_nueva,
                    diasSolicitados: days,
                    excludeRequestId: change.solicitud_id,
                    createdBy: req.user.id,
                });
                if (!balance.ok) return res.status(409).json({ error: 'El empleado no dispone de saldo suficiente para las nuevas fechas.' });

                const conflicts = await getCapacityConflicts({
                    departamento: change.departamento,
                    role: change.empleado_role,
                    fechaInicio: change.fecha_inicio_nueva,
                    fechaFin: change.fecha_fin_nueva,
                    excludeRequestId: change.solicitud_id,
                });
                if (conflicts.length && !forceException) {
                    return res.status(409).json({ error: 'Las nuevas fechas superan un límite de cobertura.', code: 'CAPACITY_CONFLICT', conflicts });
                }
                if (conflicts.length && forceException && exceptionReason.length < 5) {
                    return res.status(400).json({ error: 'Indica un motivo para autorizar la excepción de cupo.' });
                }

                affectedRequest = await VacacionesModel.updateApprovedRequestDates({
                    id: change.solicitud_id,
                    fecha_inicio: change.fecha_inicio_nueva,
                    fecha_fin: change.fecha_fin_nueva,
                    dias_solicitados: days,
                    comentario_rrhh: comment || 'Modificación aprobada a petición del empleado',
                    revisado_por: req.user.id,
                    excepcion_aprobada: conflicts.length > 0 && forceException,
                    excepcion_motivo: conflicts.length > 0 && forceException ? exceptionReason : null,
                    excepcion_por: conflicts.length > 0 && forceException ? req.user.id : null,
                });
            }

            const approved = await VacacionesModel.resolveChangeRequest({ id: changeId, estado: 'aprobada', comentarioRrhh: comment, resueltoPor: req.user.id });
            await safeAudit(req, {
                accion: 'cambio_aprobado',
                entidadTipo: 'cambio_solicitud',
                entidadId: changeId,
                empleadoId: change.empleado_id,
                year,
                detalle: { tipo: change.tipo, solicitud_id: change.solicitud_id, comentario: comment || null, excepcion_cupo: forceException },
            });
            await safeNotifyUser({
                usuarioId: change.empleado_id,
                tipo: 'cambio_aprobado',
                titulo: change.tipo === 'cancelacion' ? 'Cancelación de vacaciones aprobada' : 'Cambio de vacaciones aprobado',
                mensaje: change.tipo === 'cancelacion' ? 'RRHH ha aprobado la cancelación de tus vacaciones.' : `RRHH ha aprobado tus nuevas fechas: ${String(change.fecha_inicio_nueva).slice(0,10)} - ${String(change.fecha_fin_nueva).slice(0,10)}.`,
                solicitudId: change.solicitud_id,
            });
            return res.json({ cambio: approved, solicitud: affectedRequest });
        } catch (error) {
            console.error('Error resolviendo cambio de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo resolver la petición de cambio.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

    async yearReadiness(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede consultar el diagnóstico anual.' });
            const year = Number(req.params.year);
            if (!Number.isInteger(year)) return res.status(400).json({ error: 'Año inválido.' });
            return res.json(await VacacionesModel.getYearReadiness(year));
        } catch (error) {
            console.error('Error obteniendo diagnóstico anual:', error);
            return res.status(500).json({ error: 'No se pudo calcular la preparación del ejercicio.' });
        }
    }

    async dailyCoverage(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede consultar la cobertura diaria.' });
            const date = String(req.query.date || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha inválida.' });
            return res.json(await VacacionesModel.getDailyCoverage({ date }));
        } catch (error) {
            console.error('Error obteniendo cobertura diaria:', error);
            return res.status(500).json({ error: 'No se pudo calcular la cobertura del día.' });
        }
    }

    async exportCsv(req, res) {
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede exportar vacaciones.' });
            const year = Number(req.query.year) || new Date().getFullYear();
            const type = String(req.query.type || 'summary');

            let headers = [];
            let rows = [];
            if (type === 'requests') {
                const data = await VacacionesModel.list({ requesterId: req.user.id, requesterRole: req.user.role, year });
                headers = ['ID','Empleado','Departamento','Rol','Inicio','Fin','Días','Estado','Origen','Excepción','Motivo','Comentario RRHH'];
                rows = data.map(r => [r.id,r.empleado_nombre,r.departamento,r.empleado_role,String(r.fecha_inicio).slice(0,10),String(r.fecha_fin).slice(0,10),r.dias_solicitados,r.estado,r.origen,r.excepcion_aprobada?'Sí':'No',r.motivo||'',r.comentario_rrhh||'']);
            } else if (type === 'audit') {
                const data = await VacacionesModel.listAudit({ year, limit: 500 });
                headers = ['Fecha','Actor','Acción','Empleado','Entidad','ID','Detalle'];
                rows = data.map(r => [r.created_at,r.actor_display||r.actor_nombre,r.accion,r.empleado_display||'',r.entidad_tipo,r.entidad_id||'',JSON.stringify(r.detalle||{})]);
            } else if (type === 'changes') {
                const data = await VacacionesModel.listChangeRequests({ requesterId: req.user.id, requesterRole: req.user.role, year });
                headers = ['ID','Empleado','Tipo','Estado','Inicio actual','Fin actual','Inicio nuevo','Fin nuevo','Motivo','Comentario RRHH'];
                rows = data.map(r => [r.id,r.empleado_nombre,r.tipo,r.estado,String(r.fecha_inicio_actual).slice(0,10),String(r.fecha_fin_actual).slice(0,10),r.fecha_inicio_nueva?String(r.fecha_inicio_nueva).slice(0,10):'',r.fecha_fin_nueva?String(r.fecha_fin_nueva).slice(0,10):'',r.motivo||'',r.comentario_rrhh||'']);
            } else {
                const data = await VacacionesModel.getEmployeesSummary({ year });
                headers = ['Empleado','Departamento','Rol','Cupo base','Ajustes','Arrastre','Aprobados','Pendientes','Disponibles'];
                rows = data.map(r => [r.empleado_nombre,r.departamento,r.role,r.allowance,r.dias_ajuste||0,r.dias_arrastre||0,r.dias_aprobados||0,r.dias_pendientes||0,r.dias_disponibles||0]);
            }

            const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="vacaciones_${type}_${year}.csv"`);
            return res.send(csv);
        } catch (error) {
            console.error('Error exportando vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo generar la exportación.' });
        }
    }

    async closeYear(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede cerrar un ejercicio.' });
            const year = Number(req.params.year);
            if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error: 'Año inválido.' });
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const pending = await VacacionesModel.getYearPendingCount(year);
            const pendingChanges = await VacacionesModel.getYearPendingChangeCount(year);
            if (pending > 0 || pendingChanges > 0) {
                return res.status(409).json({
                    error: `No se puede cerrar ${year}: quedan ${pending} solicitud${pending === 1 ? '' : 'es'} pendiente${pending === 1 ? '' : 's'} y ${pendingChanges} petición${pendingChanges === 1 ? '' : 'es'} de cambio pendiente${pendingChanges === 1 ? '' : 's'}.`
                });
            }
            const config = await VacacionesModel.getAnnualConfig(year);
            if (config.cerrado) return res.json(config);
            await VacacionesModel.snapshotAnnualAllowances({
                year,
                fallbackAllowance: config.dias_base_default,
                createdBy: req.user.id,
            });
            const carryovers = await VacacionesModel.generateCarryovers({ sourceYear: year, createdBy: req.user.id });
            const closed = await VacacionesModel.closeYear({ year, closedBy: req.user.id });
            await safeAudit(req, {
                accion: 'ejercicio_cerrado',
                entidadTipo: 'ejercicio',
                entidadId: year,
                year,
                detalle: { arrastres_generados: carryovers.created, dias_arrastrados: carryovers.totalDias, ejercicio_destino: carryovers.targetYear },
            });
            return res.json({ ...closed, arrastres_generados: carryovers });
        } catch (error) {
            console.error('Error cerrando ejercicio de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo cerrar el ejercicio.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

    async reopenYear(req, res) {
        let releaseWriteLock = null;
        try {
            await VacacionesModel.ensureTable();
            if (!canManage(req.user.role)) return res.status(403).json({ error: 'Solo RRHH puede reabrir un ejercicio.' });
            const year = Number(req.params.year);
            if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error: 'Año inválido.' });
            releaseWriteLock = await VacacionesModel.acquireYearWriteLock(year);
            const reopened = await VacacionesModel.reopenYear({ year, updatedBy: req.user.id });
            await safeAudit(req, { accion: 'ejercicio_reabierto', entidadTipo: 'ejercicio', entidadId: year, year, detalle: {} });
            return res.json(reopened);
        } catch (error) {
            console.error('Error reabriendo ejercicio de vacaciones:', error);
            return res.status(500).json({ error: 'No se pudo reabrir el ejercicio.' });
        } finally {
            if (releaseWriteLock) await releaseWriteLock().catch(() => {});
        }
    }

}
