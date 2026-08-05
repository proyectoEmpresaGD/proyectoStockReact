import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    Clock3,
    History,
    Plus,
    RotateCcw,
    Search,
} from 'lucide-react';
import { agendaClient } from '../../services/agendaClient';
import { EmptyAgenda, LoadingPanel, PriorityBadge, StatusBadge } from './AgendaUI';
import { formatDateTime, VISIT_TYPES } from './agendaUtils';

const ACTIVE_STATES = new Set(['pendiente', 'en_curso']);

function visitTypeLabel(type) {
    return VISIT_TYPES.find((item) => item.value === type)?.label || type || 'Visita';
}

function SummaryItem({ label, value, detail, tone = '' }) {
    return (
        <div className={`agenda2-client-summary-item ${tone ? `agenda2-client-summary-${tone}` : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            {detail && <small>{detail}</small>}
        </div>
    );
}

export default function ClientVisitHistory({
    token,
    clientId,
    clientName,
    currentVisitId = null,
    refreshKey = 0,
    onVisit,
    onNewVisit,
    onLoaded,
    compact = false,
}) {
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        if (!clientId || !token) return undefined;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        agendaClient.listVisits(token, {
            client_id: clientId,
            limit: 1000,
            order: 'desc',
        }, controller.signal).then((response) => {
            const items = response?.items || [];
            setVisits(items);
            onLoaded?.(items);
        }).catch((requestError) => {
            if (requestError.name !== 'AbortError') setError(requestError.message || 'No se pudo cargar el historial del cliente.');
        }).finally(() => setLoading(false));
        return () => controller.abort();
    }, [clientId, onLoaded, refreshKey, token]);

    const summary = useMemo(() => {
        const now = Date.now();
        const active = visits.filter((visit) => ACTIVE_STATES.has(visit.estado));
        const completed = visits.filter((visit) => visit.estado === 'completada');
        const cancelled = visits.filter((visit) => visit.estado === 'cancelada');
        const overdue = active.filter((visit) => new Date(visit.fecha).getTime() < now);
        const next = active
            .filter((visit) => new Date(visit.fecha).getTime() >= now)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0] || null;
        const lastCompleted = completed
            .slice()
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null;
        return { active, completed, cancelled, overdue, next, lastCompleted };
    }, [visits]);

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return visits.filter((visit) => {
            if (filter === 'active' && !ACTIVE_STATES.has(visit.estado)) return false;
            if (filter === 'completed' && visit.estado !== 'completada') return false;
            if (filter === 'cancelled' && visit.estado !== 'cancelada') return false;
            if (!normalized) return true;
            return [
                visit.titulo,
                visit.descripcion,
                visit.resultado,
                visit.proxima_accion,
                visit.asignado_a,
            ].some((value) => String(value || '').toLowerCase().includes(normalized));
        });
    }, [filter, query, visits]);

    const visible = showAll ? filtered : filtered.slice(0, compact ? 6 : 15);

    if (loading && !visits.length) return <LoadingPanel label="Cargando historial comercial…" />;

    return (
        <div className="grid gap-5">
            <section className="agenda2-client-summary">
                <div className="agenda2-client-summary-heading">
                    <div>
                        <p className="cjm-kicker">Historial del cliente</p>
                        <h3>{clientName || clientId || 'Cliente'}</h3>
                    </div>
                    {onNewVisit && (
                        <button type="button" className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold" onClick={onNewVisit}>
                            <Plus size={17} /> Nueva visita
                        </button>
                    )}
                </div>
                <div className="agenda2-client-summary-grid">
                    <SummaryItem label="Total" value={visits.length} detail="registros" />
                    <SummaryItem label="Pendientes" value={summary.active.length} detail={summary.overdue.length ? `${summary.overdue.length} atrasadas` : 'al día'} tone={summary.overdue.length ? 'danger' : 'brand'} />
                    <SummaryItem label="Completadas" value={summary.completed.length} detail={summary.lastCompleted ? `Última: ${formatDateTime(summary.lastCompleted.fecha)}` : 'sin visitas realizadas'} tone="success" />
                    <SummaryItem label="Próxima" value={summary.next ? formatDateTime(summary.next.fecha) : '—'} detail={summary.next?.titulo || 'sin visita planificada'} />
                </div>
                {summary.lastCompleted?.resultado && (
                    <div className="agenda2-client-last-result">
                        <CheckCircle2 size={18} />
                        <div><strong>Último resultado registrado</strong><p>{summary.lastCompleted.resultado}</p></div>
                    </div>
                )}
            </section>

            <section className="agenda2-section-card">
                <div className="agenda2-card-header agenda2-client-history-toolbar">
                    <div><p className="cjm-kicker">Actividad</p><h3>Visitas y resultados</h3></div>
                    <div className="agenda2-client-history-actions">
                        <label className="agenda2-search-field agenda2-client-history-search">
                            <Search size={15} />
                            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en el historial" />
                        </label>
                        <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm" onClick={() => { setQuery(''); setFilter('all'); setShowAll(false); }} aria-label="Restablecer filtros">
                            <RotateCcw size={15} /> Limpiar
                        </button>
                    </div>
                </div>
                <div className="agenda2-card-content">
                    <div className="agenda2-client-filter-tabs" role="group" aria-label="Filtrar historial del cliente">
                        {[
                            ['all', `Todas (${visits.length})`],
                            ['active', `Pendientes (${summary.active.length})`],
                            ['completed', `Completadas (${summary.completed.length})`],
                            ['cancelled', `Canceladas (${summary.cancelled.length})`],
                        ].map(([value, label]) => (
                            <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setShowAll(false); }}>{label}</button>
                        ))}
                    </div>

                    {error && <div className="agenda2-error mt-4" role="alert">{error}</div>}

                    {visible.length ? (
                        <div className="agenda2-client-timeline mt-4">
                            {visible.map((visit) => {
                                const isCurrent = Number(visit.id) === Number(currentVisitId);
                                const overdue = ACTIVE_STATES.has(visit.estado) && new Date(visit.fecha).getTime() < Date.now();
                                return (
                                    <button type="button" key={visit.id} className={`agenda2-client-history-card ${isCurrent ? 'current' : ''} ${overdue ? 'overdue' : ''}`} onClick={() => onVisit?.(visit)}>
                                        <span className="agenda2-client-history-icon">{visit.estado === 'completada' ? <CheckCircle2 size={18} /> : overdue ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}</span>
                                        <span className="min-w-0 flex-1 text-left">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <strong className="truncate">{visit.titulo || visit.descripcion || 'Visita comercial'}</strong>
                                                <StatusBadge status={visit.estado} />
                                                {!compact && <PriorityBadge priority={visit.prioridad} />}
                                            </span>
                                            <span className="agenda2-client-history-meta"><Clock3 size={13} /> {formatDateTime(visit.fecha)} · {visitTypeLabel(visit.tipo)}{visit.asignado_a ? ` · ${visit.asignado_nombre || visit.asignado_a}` : ''}{Number(visit.total_notas) > 0 ? ` · ${visit.total_notas} nota${Number(visit.total_notas) === 1 ? '' : 's'}` : ''}</span>
                                            {visit.descripcion && visit.descripcion !== visit.titulo && <span className="agenda2-client-history-description">{visit.descripcion}</span>}
                                            {visit.resultado && <span className="agenda2-client-history-result"><b>Resultado:</b> {visit.resultado}</span>}
                                            {visit.proxima_accion && <span className="agenda2-client-history-followup"><b>Próxima acción:</b> {visit.proxima_accion}{visit.fecha_proxima_accion ? ` · ${formatDateTime(visit.fecha_proxima_accion)}` : ''}</span>}
                                            {visit.estado === 'cancelada' && visit.cancel_reason && <span className="agenda2-client-history-cancel"><b>Motivo:</b> {visit.cancel_reason}</span>}
                                        </span>
                                        <ChevronRight size={18} className="shrink-0 cjm-muted" />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyAgenda icon={History} title="No hay visitas con estos filtros" description="Registra la primera visita o cambia el filtro para consultar el historial completo." />
                    )}

                    {!showAll && filtered.length > visible.length && (
                        <button type="button" className="agenda2-link-button mt-4" onClick={() => setShowAll(true)}>Ver las {filtered.length} visitas</button>
                    )}
                </div>
            </section>
        </div>
    );
}
