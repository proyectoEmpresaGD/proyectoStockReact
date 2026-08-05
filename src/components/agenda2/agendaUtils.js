import { format, isToday, isPast, isTomorrow, parseISO } from 'date-fns';
import es from 'date-fns/locale/es';

export const VISIT_TYPES = [
    { value: 'visita', label: 'Visita presencial' },
    { value: 'llamada', label: 'Llamada' },
    { value: 'reunion', label: 'Reunión' },
    { value: 'videollamada', label: 'Videollamada' },
    { value: 'tarea', label: 'Tarea' },
    { value: 'seguimiento', label: 'Seguimiento' },
];

export const NOTE_TYPES = [
    { value: 'general', label: 'Nota general' },
    { value: 'seguimiento', label: 'Seguimiento comercial' },
    { value: 'llamada', label: 'Llamada' },
    { value: 'correo', label: 'Correo' },
    { value: 'acuerdo', label: 'Acuerdo' },
    { value: 'incidencia', label: 'Incidencia' },
    { value: 'presupuesto', label: 'Presupuesto' },
    { value: 'muestra', label: 'Muestra enviada' },
    { value: 'tarea', label: 'Tarea pendiente' },
];

export const PRIORITIES = [
    { value: 'baja', label: 'Baja' },
    { value: 'media', label: 'Media' },
    { value: 'alta', label: 'Alta' },
    { value: 'urgente', label: 'Urgente' },
];

export const VISIT_STATUS = {
    pendiente: 'Pendiente',
    en_curso: 'En curso',
    completada: 'Completada',
    cancelada: 'Cancelada',
    reprogramada: 'Reprogramada',
};

export const NOTE_STATUS = {
    activa: 'Activa',
    pendiente: 'Pendiente',
    completada: 'Completada',
    archivada: 'Archivada',
};

export function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toLocalInput(value) {
    const date = toDate(value);
    if (!date) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(value, fallback = 'Sin fecha') {
    const date = toDate(value);
    return date ? format(date, "d MMM yyyy · HH:mm", { locale: es }) : fallback;
}

export function formatDayLabel(value) {
    const date = toDate(value);
    if (!date) return 'Sin fecha';
    if (isToday(date)) return `Hoy · ${format(date, 'HH:mm')}`;
    if (isTomorrow(date)) return `Mañana · ${format(date, 'HH:mm')}`;
    return format(date, "EEEE d MMM · HH:mm", { locale: es });
}

export function isOverdue(item) {
    const date = toDate(item?.fecha || item?.fecha_seguimiento || item?.fecha_efectiva);
    return Boolean(date && isPast(date) && !isToday(date) && !['completada', 'cancelada', 'archivada'].includes(item?.estado));
}

export function getUserLabel(user) {
    if (!user) return 'Sin asignar';
    const full = [user.nombre, user.apellido1, user.apellido2].filter(Boolean).join(' ').trim();
    return full || user.username || `Usuario ${user.id}`;
}

export function visitToCalendarEvent(visit) {
    const start = toDate(visit.fecha) || new Date();
    const end = toDate(visit.fecha_fin) || new Date(start.getTime() + (Number(visit.duracion_minutos) || 60) * 60_000);
    return {
        ...visit,
        title: `${visit.cliente_nombre || visit.cliente_id || 'Cliente'} · ${visit.titulo || 'Visita'}`,
        start,
        end,
    };
}

const HISTORY_ACTION_LABELS = {
    visita_creada: 'Visita creada',
    visita_registrada_como_realizada: 'Visita realizada registrada',
    visita_actualizada: 'Datos de la visita actualizados',
    visita_reprogramada: 'Visita reprogramada',
    visita_iniciada: 'Visita iniciada',
    visita_completada: 'Visita completada',
    visita_cancelada: 'Visita cancelada',
    visita_reabierta_por_admin: 'Visita reabierta por administración',
    visita_eliminada_definitivamente: 'Visita eliminada definitivamente',
    nota_creada: 'Nota creada',
    nota_actualizada: 'Nota actualizada',
    nota_eliminada: 'Nota eliminada',
};

export function formatHistoryAction(action) {
    const key = String(action || '').trim();
    if (HISTORY_ACTION_LABELS[key]) return HISTORY_ACTION_LABELS[key];
    return key
        .replace(/^mantenimiento_/, 'Mantenimiento: ')
        .replaceAll('_', ' ')
        .replace(/^./, (letter) => letter.toUpperCase()) || 'Actividad registrada';
}
