import React from 'react';
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, Plus, StickyNote } from 'lucide-react';
import { EmptyAgenda, LoadingPanel, MetricCard, VisitCard } from './AgendaUI';
import { formatDayLabel } from './agendaUtils';

export default function AgendaToday({ overview, loading, onVisit, onNewVisit, onNewNote, onOpenTab, onReminderAction }) {
    if (loading && !overview) return <LoadingPanel label="Preparando tu jornada…" />;
    const data = overview || { counts: {}, overdue: [], today: [], upcoming: [], reminders: [] };
    return (
        <div className="grid gap-6">
            <section className="agenda2-metrics-grid">
                <MetricCard icon={AlertTriangle} label="Atrasadas" value={data.counts?.vencidas || 0} detail="Necesitan revisión" tone="danger" onClick={() => onOpenTab?.('seguimientos', { period: 'overdue' })} />
                <MetricCard icon={CalendarDays} label="Hoy" value={data.counts?.hoy || 0} detail="Planificadas para hoy" tone="brand" />
                <MetricCard icon={BellRing} label="Recordatorios" value={data.reminders?.length || 0} detail="Pendientes o pospuestos" tone="warning" />
                <MetricCard icon={CheckCircle2} label="Completadas" value={data.counts?.completadas_mes || 0} detail="Durante este mes" tone="success" />
            </section>

            <section className="agenda2-quick-actions">
                <button type="button" onClick={onNewVisit}><span><Plus size={20} /></span><strong>Nueva visita</strong><small>Planifica una cita, llamada o tarea</small></button>
                <button type="button" onClick={onNewNote}><span><StickyNote size={20} /></span><strong>Nueva nota</strong><small>Registra un acuerdo o seguimiento</small></button>
                <button type="button" onClick={() => onOpenTab?.('calendario')}><span><CalendarDays size={20} /></span><strong>Abrir calendario</strong><small>Revisa tu planificación completa</small></button>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
                <div className="grid gap-6">
                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker">Jornada actual</p><h2>Visitas de hoy</h2></div><span className="agenda2-count">{data.today?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.today?.length ? <div className="grid gap-3">{data.today.map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} />)}</div> : <EmptyAgenda title="No tienes visitas para hoy" description="Puedes crear una visita o aprovechar para cerrar seguimientos pendientes." action={<button type="button" onClick={onNewVisit} className="cjm-primary-button min-h-11 rounded-xl px-4 font-semibold">Planificar visita</button>} />}
                        </div>
                    </section>

                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker">Próximos 15 días</p><h2>Siguiente actividad</h2></div><button type="button" className="agenda2-link-button" onClick={() => onOpenTab?.('calendario')}>Ver calendario</button></div>
                        <div className="agenda2-card-content">
                            {data.upcoming?.length ? <div className="grid gap-3">{data.upcoming.slice(0, 8).map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} compact />)}</div> : <EmptyAgenda title="No hay próximas visitas" description="Tu agenda está despejada para los próximos días." />}
                        </div>
                    </section>
                </div>

                <div className="grid content-start gap-6">
                    <section className="agenda2-section-card agenda2-danger-section">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker">Atención</p><h2>Visitas atrasadas</h2></div><span className="agenda2-count">{data.counts?.vencidas || data.overdue?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.overdue?.length ? (
                                <div className="grid gap-3">
                                    {data.overdue.map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} compact />)}
                                    {Number(data.counts?.vencidas || 0) > data.overdue.length && (
                                        <button type="button" className="agenda2-link-button justify-self-start" onClick={() => onOpenTab?.('seguimientos', { period: 'overdue' })}>
                                            Ver las {data.counts.vencidas} visitas atrasadas
                                        </button>
                                    )}
                                </div>
                            ) : <p className="agenda2-positive-message"><CheckCircle2 size={18} /> No tienes visitas atrasadas.</p>}
                        </div>
                    </section>

                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker">Avisos</p><h2>Recordatorios</h2></div><span className="agenda2-count">{data.reminders?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.reminders?.length ? <div className="grid gap-3">{data.reminders.slice(0, 8).map((reminder) => <article key={reminder.id} className="agenda2-reminder-card"><span><BellRing size={17} /></span><div className="min-w-0 flex-1"><strong>{reminder.titulo || reminder.visita_titulo || reminder.nota_titulo || 'Recordatorio'}</strong><p>{reminder.cliente_nombre || reminder.mensaje || ''}</p><small>{formatDayLabel(reminder.fecha_efectiva || reminder.fecha_recordatorio)}</small><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onReminderAction?.(reminder, 'snooze')}>Posponer 1 h</button><button type="button" onClick={() => onReminderAction?.(reminder, 'read')}>Hecho</button></div></div></article>)}</div> : <EmptyAgenda icon={BellRing} title="No hay avisos pendientes" />}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
