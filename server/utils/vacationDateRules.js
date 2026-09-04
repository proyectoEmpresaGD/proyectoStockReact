export const COMPANY_WORK_SCHEDULE = Object.freeze({
    workingIsoDays: new Set([1, 2, 3, 4, 5]),
    startTime: '07:00',
    endTime: '15:00',
});

function parseDateOnlyUtc(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
}

export function getIsoWeekday(value) {
    const date = parseDateOnlyUtc(value);
    if (!date) return null;
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
}

export function isCompanyWeekend(value) {
    const isoDay = getIsoWeekday(value);
    return isoDay != null && !COMPANY_WORK_SCHEDULE.workingIsoDays.has(isoDay);
}

export function validateVacationEndpoints(fechaInicio, fechaFin) {
    if (isCompanyWeekend(fechaInicio)) {
        return `La fecha de inicio debe ser de lunes a viernes. La jornada habitual es de ${COMPANY_WORK_SCHEDULE.startTime} a ${COMPANY_WORK_SCHEDULE.endTime} y los fines de semana no son laborables.`;
    }
    if (isCompanyWeekend(fechaFin)) {
        return `La fecha de fin debe ser de lunes a viernes. La jornada habitual es de ${COMPANY_WORK_SCHEDULE.startTime} a ${COMPANY_WORK_SCHEDULE.endTime} y los fines de semana no son laborables.`;
    }
    return null;
}

function toDateKeyUtc(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function toMmDdUtc(date) {
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function countCompanyWorkingDays(startDate, endDate, { nonWorkingDates = [], mandatoryMmDd = [] } = {}) {
    const start = parseDateOnlyUtc(startDate);
    const end = parseDateOnlyUtc(endDate);
    if (!start || !end || start > end) return 0;

    const nonWorkingSet = new Set((nonWorkingDates || []).map((value) => String(value).slice(0, 10)));
    const mandatorySet = new Set((mandatoryMmDd || []).map((value) => String(value).trim()));

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
        const isoDay = getIsoWeekday(toDateKeyUtc(current));
        const isWorkingWeekday = COMPANY_WORK_SCHEDULE.workingIsoDays.has(isoDay);
        const isNonWorking = nonWorkingSet.has(toDateKeyUtc(current));
        const isMandatory = mandatorySet.has(toMmDdUtc(current));
        if (isWorkingWeekday && !isNonWorking && !isMandatory) count += 1;
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return count;
}
