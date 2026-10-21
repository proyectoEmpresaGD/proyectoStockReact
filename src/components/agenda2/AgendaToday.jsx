import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import React from 'react';
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, Plus, StickyNote } from 'lucide-react';
import { EmptyAgenda, LoadingPanel, MetricCard, VisitCard } from './AgendaUI';
import { formatDayLabel } from './agendaUtils';

export default function AgendaToday({ overview, loading, onVisit, onNewVisit, onNewNote, onOpenTab, onReminderAction }) {
    if (loading && !overview) return <LocalizedElement><LoadingPanel label="Preparando tu jornada…" /></LocalizedElement>;
    const data = overview || { counts: {}, overdue: [], today: [], upcoming: [], reminders: [] };
    return (
        <div className="grid gap-6">
            <section className="agenda2-metrics-grid">
                <LocalizedElement><MetricCard icon={AlertTriangle} label="Atrasadas" value={data.counts?.vencidas || 0} detail="Necesitan revisión" tone="danger" onClick={() => onOpenTab?.('seguimientos', { period: 'overdue' })} /></LocalizedElement>
                <MetricCard icon={CalendarDays} label="Hoy" value={data.counts?.hoy || 0} detail="Planificadas para hoy" tone="brand" />
                <MetricCard icon={BellRing} label="Recordatorios" value={data.reminders?.length || 0} detail="Pendientes o pospuestos" tone="warning" />
                <LocalizedElement><MetricCard icon={CheckCircle2} label="Completadas" value={data.counts?.completadas_mes || 0} detail="Durante este mes" tone="success" /></LocalizedElement>
            </section>

            <section className="agenda2-quick-actions">
                <button type="button" onClick={onNewVisit}><span><Plus size={20} /></span><strong><TranslatedText>Nueva visita</TranslatedText></strong><small><TranslatedText>Planifica una cita, llamada o tarea</TranslatedText></small></button>
                <button type="button" onClick={onNewNote}><span><StickyNote size={20} /></span><strong><TranslatedText>Nueva nota</TranslatedText></strong><small><TranslatedText>Registra un acuerdo o seguimiento</TranslatedText></small></button>
                <button type="button" onClick={() => onOpenTab?.('calendario')}><span><CalendarDays size={20} /></span><strong><TranslatedText>Abrir calendario</TranslatedText></strong><small><TranslatedText>Revisa tu planificación completa</TranslatedText></small></button>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
                <div className="grid gap-6">
                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker"><TranslatedText>Jornada actual</TranslatedText></p><h2><TranslatedText>Visitas de hoy</TranslatedText></h2></div><span className="agenda2-count">{data.today?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.today?.length ? <div className="grid gap-3">{data.today.map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} />)}</div> : <LocalizedElement><EmptyAgenda title="No tienes visitas para hoy" description="Puedes crear una visita o aprovechar para cerrar seguimientos pendientes." action={<button type="button" onClick={onNewVisit} className="cjm-primary-button min-h-11 rounded-xl px-4 font-semibold"><TranslatedText>Planificar visita</TranslatedText></button>} /></LocalizedElement>}
                        </div>
                    </section>

                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker"><TranslatedText>Próximos 15 días</TranslatedText></p><h2><TranslatedText>Siguiente actividad</TranslatedText></h2></div><button type="button" className="agenda2-link-button" onClick={() => onOpenTab?.('calendario')}><TranslatedText>Ver calendario</TranslatedText></button></div>
                        <div className="agenda2-card-content">
                            {data.upcoming?.length ? <div className="grid gap-3">{data.upcoming.slice(0, 8).map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} compact />)}</div> : <LocalizedElement><EmptyAgenda title="No hay próximas visitas" description="Tu agenda está despejada para los próximos días." /></LocalizedElement>}
                        </div>
                    </section>
                </div>

                <div className="grid content-start gap-6">
                    <section className="agenda2-section-card agenda2-danger-section">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker"><TranslatedText>Atención</TranslatedText></p><h2><TranslatedText>Visitas atrasadas</TranslatedText></h2></div><span className="agenda2-count">{data.counts?.vencidas || data.overdue?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.overdue?.length ? (
                                <div className="grid gap-3">
                                    {data.overdue.map((visit) => <VisitCard key={visit.id} visit={visit} onClick={onVisit} compact />)}
                                    {Number(data.counts?.vencidas || 0) > data.overdue.length && (
                                        <button type="button" className="agenda2-link-button justify-self-start" onClick={() => onOpenTab?.('seguimientos', { period: 'overdue' })}>
                                            <TranslatedText>Ver las</TranslatedText> {data.counts.vencidas} <TranslatedText>visitas atrasadas</TranslatedText>
                                        </button>
                                    )}
                                </div>
                            ) : <p className="agenda2-positive-message"><CheckCircle2 size={18} /> <TranslatedText>No tienes visitas atrasadas.</TranslatedText></p>}
                        </div>
                    </section>

                    <section className="agenda2-section-card">
                        <div className="agenda2-card-header"><div><p className="cjm-kicker"><TranslatedText>Avisos</TranslatedText></p><h2><TranslatedText>Recordatorios</TranslatedText></h2></div><span className="agenda2-count">{data.reminders?.length || 0}</span></div>
                        <div className="agenda2-card-content">
                            {data.reminders?.length ? <div className="grid gap-3">{data.reminders.slice(0, 8).map((reminder) => <article key={reminder.id} className="agenda2-reminder-card"><span><BellRing size={17} /></span><div className="min-w-0 flex-1"><strong>{reminder.titulo || reminder.visita_titulo || reminder.nota_titulo || 'Recordatorio'}</strong><p>{reminder.cliente_nombre || reminder.mensaje || ''}</p><small>{formatDayLabel(reminder.fecha_efectiva || reminder.fecha_recordatorio)}</small><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onReminderAction?.(reminder, 'snooze')}><TranslatedText>Posponer 1 h</TranslatedText></button><button type="button" onClick={() => onReminderAction?.(reminder, 'read')}><TranslatedText>Hecho</TranslatedText></button></div></div></article>)}</div> : <LocalizedElement><EmptyAgenda icon={BellRing} title="No hay avisos pendientes" /></LocalizedElement>}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
