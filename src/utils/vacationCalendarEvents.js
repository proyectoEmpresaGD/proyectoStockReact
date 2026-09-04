function parseDateOnly(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function addCalendarDay(date) {
    const result = new Date(date);
    result.setDate(result.getDate() + 1);
    return result;
}

export function buildVacationRequestEvents(requests, { isManager = false } = {}) {
    return (Array.isArray(requests) ? requests : [])
        .filter((item) => ['pendiente', 'aprobada'].includes(String(item?.estado || '').toLowerCase()))
        .map((item) => {
            const start = parseDateOnly(item.fecha_inicio);
            const endBase = parseDateOnly(item.fecha_fin);
            if (!start || !endBase) return null;

            return {
                id: `request-${item.id}`,
                title: isManager
                    ? `${item.empleado_nombre || 'Empleado'} · ${item.estado}`
                    : `Mis vacaciones · ${item.estado}`,
                start,
                end: addCalendarDay(endBase),
                allDay: true,
                estado: item.estado,
                resource: item,
            };
        })
        .filter(Boolean);
}

export function applyVacationRequestMutation(requests, mutationRequest) {
    if (!mutationRequest?.id) return Array.isArray(requests) ? requests : [];

    const current = Array.isArray(requests) ? requests : [];
    const withoutCurrent = current.filter((item) => String(item.id) !== String(mutationRequest.id));
    const status = String(mutationRequest.estado || '').toLowerCase();

    if (!['pendiente', 'aprobada'].includes(status)) return withoutCurrent;
    return [...withoutCurrent, mutationRequest];
}
