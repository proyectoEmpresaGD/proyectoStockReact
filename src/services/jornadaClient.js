const API_BASE = import.meta.env.VITE_API_BASE_URL;
const QUEUE_PREFIX = 'cjm-jornada-offline-v2:';

const queueKey = (userId) => `${QUEUE_PREFIX}${userId}`;

const parseJson = async (response, path = '') => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const isMissingJornadaRoute = response.status === 404 && String(path).startsWith('/api/jornada/');
        const error = new Error(
            isMissingJornadaRoute
                ? 'El backend de Registro de Jornada está desactualizado o no tiene registrada esta ruta. Instala la V4 completa y reinicia el servidor.'
                : (payload?.message || `Error HTTP ${response.status}`)
        );
        error.status = response.status;
        error.code = isMissingJornadaRoute ? 'JORNADA_API_OUTDATED' : payload?.code;
        error.details = payload?.details || null;
        throw error;
    }
    return payload;
};

const authHeaders = (token, json = true) => ({
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const request = async (token, path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...authHeaders(token, options.body !== undefined),
            ...(options.headers || {}),
        },
    });
    return parseJson(response, path);
};

export const getPendingJornadaEvents = (userId) => {
    if (!userId) return [];
    try {
        const raw = localStorage.getItem(queueKey(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const setPendingJornadaEvents = (userId, items) => {
    localStorage.setItem(queueKey(userId), JSON.stringify(items));
};

const makeClientEventId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const loadJornadaToday = (token) => request(token, '/api/jornada/hoy');

export const loadJornadaHistory = (token, { desde, hasta }) => {
    const query = new URLSearchParams({ desde, hasta });
    return request(token, `/api/jornada/historial?${query.toString()}`);
};

export const loadJornadaMonth = (token, { year, month }) => {
    const query = new URLSearchParams({ year: String(year), month: String(month) });
    return request(token, `/api/jornada/mes?${query.toString()}`);
};

export const loadJornadaConfiguration = (token, fecha) => {
    const query = fecha ? `?${new URLSearchParams({ fecha }).toString()}` : '';
    return request(token, `/api/jornada/configuracion${query}`);
};

export const loadJornadaMeta = (token) => request(token, '/api/jornada/meta');

export const loadJornadaParticipation = (token, fecha = null) => {
    const query = fecha ? `?${new URLSearchParams({ fecha }).toString()}` : '';
    return request(token, `/api/jornada/participacion${query}`);
};

export const loadJornadaPolicy = (token) => request(token, '/api/jornada/politica');

export const loadJornadaPolicyHistory = (token) => request(token, '/api/jornada/politica/historial');

export const saveJornadaPolicy = (token, body) => request(token, '/api/jornada/politica', {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadJornadaCompliance = (token) => request(token, '/api/jornada/cumplimiento');

export const verifyJornadaIntegrity = (token, userId = null) => {
    const query = userId ? `?${new URLSearchParams({ userId: String(userId) }).toString()}` : '';
    return request(token, `/api/jornada/integridad${query}`);
};

export const loadJornadaIncidents = (token) => request(token, '/api/jornada/incidencias');

export const createJornadaIncident = (token, body) => request(token, '/api/jornada/incidencias', {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadTeamJornadaIncidents = (token) => request(token, '/api/jornada/incidencias/equipo');

export const loadJornadaCorrections = (token) => request(token, '/api/jornada/correcciones');

export const createJornadaCorrection = (token, body) => request(token, '/api/jornada/correcciones', {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadTeamJornada = (token) => request(token, '/api/jornada/equipo');

export const loadTeamJornadaMonth = (token, { year, month }) => {
    const query = new URLSearchParams({ year: String(year), month: String(month) });
    return request(token, `/api/jornada/equipo/mes?${query.toString()}`);
};

export const loadTeamJornadaAssignments = (token, fecha = null) => {
    const query = fecha ? `?${new URLSearchParams({ fecha }).toString()}` : '';
    return request(token, `/api/jornada/asignaciones/equipo${query}`);
};

export const saveJornadaAssignment = (token, userId, body) => request(token, `/api/jornada/asignaciones/${userId}`, {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadTeamJornadaConfigurations = (token) => request(token, '/api/jornada/configuraciones/equipo');

export const saveJornadaConfiguration = (token, userId, body) => request(token, `/api/jornada/configuraciones/${userId}`, {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadTeamJornadaCorrections = (token) => request(token, '/api/jornada/correcciones/equipo');

export const reviewJornadaCorrection = (token, correctionId, body) => request(token, `/api/jornada/correcciones/${correctionId}/revisar`, {
    method: 'POST',
    body: JSON.stringify(body),
});

export const loadPendingOfflineJornadaReviews = (token) => request(token, '/api/jornada/revisiones/offline');

export const reviewOfflineJornadaEvent = (token, eventId, body) => request(token, `/api/jornada/revisiones/offline/${eventId}`, {
    method: 'POST',
    body: JSON.stringify(body),
});

export const closeJornadaMonth = (token, body) => request(token, '/api/jornada/cierres', {
    method: 'POST',
    body: JSON.stringify(body),
});

export const reopenJornadaMonth = (token, closeId, motivo) => request(token, `/api/jornada/cierres/${closeId}/reabrir`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
});

export const registerJornadaEvent = async ({ token, userId, tipo, modalidad }) => {
    const clientEventId = makeClientEventId();
    const offlineOccurredAt = new Date().toISOString();
    const pendingEvent = {
        id: `offline-${clientEventId}`,
        clientEventId,
        tipo,
        modalidad,
        occurred_at: offlineOccurredAt,
        offlineOccurredAt,
        source: 'offline',
        requires_review: true,
        pending_sync: true,
    };

    if (!navigator.onLine) {
        const queue = getPendingJornadaEvents(userId);
        setPendingJornadaEvents(userId, [...queue, pendingEvent]);
        return { offline: true, event: pendingEvent };
    }

    try {
        const payload = await request(token, '/api/jornada/eventos', {
            method: 'POST',
            body: JSON.stringify({ tipo, modalidad, clientEventId }),
        });
        return { offline: false, event: payload.event };
    } catch (error) {
        if (error?.status) throw error;
        const queue = getPendingJornadaEvents(userId);
        setPendingJornadaEvents(userId, [...queue, pendingEvent]);
        return { offline: true, event: pendingEvent };
    }
};

export const syncPendingJornadaEvents = async ({ token, userId }) => {
    const queue = [...getPendingJornadaEvents(userId)].sort(
        (a, b) => new Date(a.offlineOccurredAt).getTime() - new Date(b.offlineOccurredAt).getTime()
    );
    if (!queue.length || !navigator.onLine) return { synced: 0, remaining: queue.length, errors: [] };

    const remaining = [];
    const errors = [];
    let synced = 0;

    for (const event of queue) {
        try {
            await request(token, '/api/jornada/eventos/offline', {
                method: 'POST',
                body: JSON.stringify({
                    tipo: event.tipo,
                    modalidad: event.modalidad,
                    clientEventId: event.clientEventId,
                    offlineOccurredAt: event.offlineOccurredAt,
                }),
            });
            synced += 1;
        } catch (error) {
            remaining.push(event);
            errors.push(error);
            if (!error?.status) break;
        }
    }

    setPendingJornadaEvents(userId, remaining);
    return { synced, remaining: remaining.length, errors };
};

export const downloadJornadaInspectionJson = async (token, { desde, hasta, userId = null }) => {
    const query = new URLSearchParams({ desde, hasta });
    if (userId) query.set('userId', String(userId));
    const path = `/api/jornada/inspeccion?${query.toString()}`;
    const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token, false) });
    if (!response.ok) {
        await parseJson(response, path);
        return;
    }
    const payload = await response.json();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `expediente-jornada-${userId ? `usuario-${userId}-` : 'equipo-'}${desde}-${hasta}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return payload?.evidence || null;
};

export const downloadJornadaCsv = async (token, { desde, hasta, scope = 'self' }) => {
    const query = new URLSearchParams({ desde, hasta });
    if (scope === 'team') query.set('scope', 'team');
    const response = await fetch(`${API_BASE}/api/jornada/export.csv?${query.toString()}`, {
        headers: authHeaders(token, false),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.message || 'No se pudo descargar el CSV.');
        error.code = payload?.code;
        throw error;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jornada-${scope}-${desde}-${hasta}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
