export const COMPANY_WORK_SCHEDULE = Object.freeze({
    workingDays: [1, 2, 3, 4, 5], // lunes (1) a viernes (5)
    startTime: '07:00',
    endTime: '15:00',
    label: 'Lunes a viernes · 07:00–15:00',
});

function parseDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
    ) return null;

    return parsed;
}

export function isWeekendDate(value) {
    const date = parseDateOnly(value);
    if (!date) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
}

export function isCompanyWorkingWeekday(value) {
    const date = parseDateOnly(value);
    if (!date) return false;
    return COMPANY_WORK_SCHEDULE.workingDays.includes(date.getDay());
}

export function validateVacationEndpoints(fechaInicio, fechaFin) {
    if (fechaInicio && isWeekendDate(fechaInicio)) {
        return 'La fecha de inicio debe ser de lunes a viernes. Sábados y domingos no son laborables.';
    }
    if (fechaFin && isWeekendDate(fechaFin)) {
        return 'La fecha de fin debe ser de lunes a viernes. Sábados y domingos no son laborables.';
    }
    return '';
}
