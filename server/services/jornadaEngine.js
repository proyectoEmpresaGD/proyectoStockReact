const EVENT_ORDER = ['entrada', 'inicio_pausa', 'fin_pausa', 'salida'];

const asMs = (value) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

const nonNegativeDuration = (start, end) => {
    const a = asMs(start);
    const b = asMs(end);
    if (a === null || b === null) return 0;
    return Math.max(0, b - a);
};

export const expectedNextTypes = (lastType) => {
    if (!lastType || lastType === 'salida') return ['entrada'];
    if (lastType === 'entrada' || lastType === 'fin_pausa') return ['inicio_pausa', 'salida'];
    if (lastType === 'inicio_pausa') return ['fin_pausa', 'salida'];
    return [];
};

export const sortJornadaEvents = (events = []) => [...events].sort((a, b) => {
    const timeDiff = (asMs(a.occurred_at) || 0) - (asMs(b.occurred_at) || 0);
    if (timeDiff !== 0) return timeDiff;
    return String(a.effective_id ?? a.id ?? '').localeCompare(String(b.effective_id ?? b.id ?? ''), undefined, { numeric: true });
});

export const buildDaySummary = (events = [], options = {}) => {
    const sorted = sortJornadaEvents(events);
    const includeOpenUntil = options.includeOpenUntil ? new Date(options.includeOpenUntil) : null;

    let workStart = null;
    let pauseStart = null;
    let workedMs = 0;
    let pauseMs = 0;
    let firstEntry = null;
    let lastExit = null;
    let previousType = null;
    const anomalies = [];

    for (const event of sorted) {
        const eventAt = asMs(event.occurred_at);
        if (eventAt === null || !EVENT_ORDER.includes(event.tipo)) {
            anomalies.push({ code: 'invalid_event', eventId: event.effective_id ?? event.id ?? null });
            continue;
        }

        const allowed = expectedNextTypes(previousType);
        if (!allowed.includes(event.tipo)) {
            anomalies.push({
                code: 'invalid_sequence',
                eventId: event.effective_id ?? event.id ?? null,
                expected: allowed,
                actual: event.tipo,
            });
        }

        if (event.tipo === 'entrada') {
            workStart = event.occurred_at;
            pauseStart = null;
            firstEntry ||= event.occurred_at;
        } else if (event.tipo === 'inicio_pausa') {
            if (workStart) workedMs += nonNegativeDuration(workStart, event.occurred_at);
            workStart = null;
            pauseStart = event.occurred_at;
        } else if (event.tipo === 'fin_pausa') {
            if (pauseStart) pauseMs += nonNegativeDuration(pauseStart, event.occurred_at);
            pauseStart = null;
            workStart = event.occurred_at;
        } else if (event.tipo === 'salida') {
            if (pauseStart) pauseMs += nonNegativeDuration(pauseStart, event.occurred_at);
            if (workStart) workedMs += nonNegativeDuration(workStart, event.occurred_at);
            pauseStart = null;
            workStart = null;
            lastExit = event.occurred_at;
        }

        previousType = event.tipo;
    }

    const last = sorted.at(-1) || null;
    if (includeOpenUntil && !Number.isNaN(includeOpenUntil.getTime())) {
        if ((last?.tipo === 'entrada' || last?.tipo === 'fin_pausa') && workStart) {
            workedMs += nonNegativeDuration(workStart, includeOpenUntil);
        } else if (last?.tipo === 'inicio_pausa' && pauseStart) {
            pauseMs += nonNegativeDuration(pauseStart, includeOpenUntil);
        }
    } else if (last && last.tipo !== 'salida') {
        anomalies.push({ code: last.tipo === 'inicio_pausa' ? 'open_pause' : 'open_work' });
    }

    const status = !last || last.tipo === 'salida'
        ? 'fuera'
        : last.tipo === 'inicio_pausa'
            ? 'pausa'
            : 'trabajando';

    for (const event of sorted) {
        if (event.review_status === 'rechazado') {
            anomalies.push({ code: 'rejected_offline_event', eventId: event.effective_id ?? event.id ?? null });
        }
    }

    return {
        status,
        lastEvent: last,
        nextAllowed: expectedNextTypes(last?.tipo),
        workedMinutes: Math.floor(workedMs / 60000),
        pauseMinutes: Math.floor(pauseMs / 60000),
        firstEntry,
        lastExit,
        mode: last?.modalidad || null,
        requiresReview: sorted.some((event) => Boolean(event.requires_review) && event.review_status !== 'validado'),
        adjusted: sorted.some((event) => Boolean(event.adjusted)),
        anomalies,
        complete: !last || last.tipo === 'salida',
    };
};

export const normalizeWeeklyPlan = (plan) => {
    const raw = Array.isArray(plan) ? plan : [];
    const byWeekday = new Map();

    for (const item of raw) {
        const weekday = Number(item?.weekday);
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;

        const targetMinutes = Math.max(0, Math.min(1440, Number(item?.targetMinutes) || 0));
        const startTime = /^\d{2}:\d{2}$/.test(String(item?.startTime || '')) ? item.startTime : null;
        const endTime = /^\d{2}:\d{2}$/.test(String(item?.endTime || '')) ? item.endTime : null;
        const working = Boolean(item?.working ?? targetMinutes > 0);

        byWeekday.set(weekday, {
            weekday,
            working,
            targetMinutes: working ? targetMinutes : 0,
            startTime: working ? startTime : null,
            endTime: working ? endTime : null,
        });
    }

    return Array.from({ length: 7 }, (_, index) => {
        const weekday = index + 1;
        return byWeekday.get(weekday) || {
            weekday,
            working: weekday <= 5,
            targetMinutes: weekday <= 5 ? 480 : 0,
            startTime: weekday <= 5 ? '07:00' : null,
            endTime: weekday <= 5 ? '15:00' : null,
        };
    });
};

export const weekdayIsoFromDateOnly = (dateOnly) => {
    const [year, month, day] = String(dateOnly).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const jsDay = date.getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
};

export const expectedMinutesForDate = ({ date, config, isVacation = false, isHoliday = false }) => {
    if (isVacation || isHoliday) return 0;
    const plan = normalizeWeeklyPlan(config?.plan_semanal);
    const weekday = weekdayIsoFromDateOnly(date);
    return Number(plan.find((item) => item.weekday === weekday)?.targetMinutes || 0);
};

export const buildPeriodTotals = (days = []) => days.reduce((acc, day) => {
    const worked = Number(day?.summary?.workedMinutes || 0);
    const expected = Number(day?.expectedMinutes || 0);
    acc.workedMinutes += worked;
    acc.expectedMinutes += expected;
    acc.balanceMinutes += worked - expected;
    if (worked > 0) acc.workedDays += 1;
    if (day?.summary?.anomalies?.length || day?.summary?.requiresReview) acc.incidentDays += 1;
    if (day?.dayType === 'vacaciones') acc.vacationDays += 1;
    if (day?.dayType === 'festivo') acc.holidayDays += 1;
    return acc;
}, {
    workedMinutes: 0,
    expectedMinutes: 0,
    balanceMinutes: 0,
    workedDays: 0,
    incidentDays: 0,
    vacationDays: 0,
    holidayDays: 0,
});
