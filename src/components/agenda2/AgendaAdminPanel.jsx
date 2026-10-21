import { localeNumberFormatter } from '../../i18n/locale.js';
import { translateCurrent } from '../../i18n/translations.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BellRing,
    CalendarClock,
    CheckCircle2,
    DatabaseZap,
    FileText,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    UserRoundCheck,
    Wrench,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { agendaClient } from '../../services/agendaClient';
import { EmptyAgenda, LoadingPanel, PriorityBadge, StatusBadge } from './AgendaUI';
import { formatDateTime } from './agendaUtils';

const sections = [
    { id: 'diagnostico', label: 'Diagnóstico', icon: ShieldCheck },
    { id: 'visitas', label: 'Visitas', icon: CalendarClock },
    { id: 'notas', label: 'Notas', icon: FileText },
    { id: 'avisos', label: 'Recordatorios', icon: BellRing },
];

const repairs = [
    {
        id: 'normalize-catalog-values',
        title: 'Normalizar estados y categorías',
        description: 'Corrige estados, tipos, prioridades y duraciones que no pertenecen a los valores permitidos.',
        icon: Wrench,
    },
    {
        id: 'fix-visit-dates',
        title: 'Corregir fechas finales',
        description: 'Calcula de nuevo la hora final de las visitas con una duración inválida.',
        icon: CalendarClock,
    },
    {
        id: 'normalize-assignments',
        title: 'Asignar responsables faltantes',
        description: 'Asigna un responsable válido a visitas, notas y recordatorios que se han quedado sin usuario gestionable.',
        icon: UserRoundCheck,
    },
    {
        id: 'claim-orphaned-records',
        title: 'Recuperar registros sin autor',
        description: 'Asigna al administrador las visitas y notas cuyo creador original ya no existe.',
        icon: ShieldCheck,
    },
    {
        id: 'close-final-reminders',
        title: 'Cerrar avisos obsoletos',
        description: 'Descarta avisos activos de visitas finalizadas o notas cerradas.',
        icon: BellRing,
    },
    {
        id: 'reset-expired-snoozes',
        title: 'Recuperar avisos pospuestos',
        description: 'Devuelve a pendientes los avisos cuya posposición ya ha vencido.',
        icon: RefreshCw,
    },
    {
        id: 'sync-note-relations',
        title: 'Sincronizar relaciones',
        description: 'Iguala la compatibilidad antigua de notas con las relaciones normalizadas.',
        icon: DatabaseZap,
    },
];

const number = (value) => localeNumberFormatter().format(Number(value) || 0);

export default function AgendaAdminPanel({ token, refreshKey, onVisit, onNote, onChanged }) {
    const [section, setSection] = useState('diagnostico');
    const [health, setHealth] = useState(null);
    const [visits, setVisits] = useState([]);
    const [notes, setNotes] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pendingRepair, setPendingRepair] = useState(null);
    const [working, setWorking] = useState(false);
    const [deleteReminderId, setDeleteReminderId] = useState(null);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const [healthResponse, visitsResponse, notesResponse, remindersResponse] = await Promise.all([
                agendaClient.adminHealth(token),
                agendaClient.listVisits(token, { q: query, limit: 100, order: 'desc' }),
                agendaClient.listNotes(token, { q: query, limit: 100, offset: 0 }),
                agendaClient.listReminders(token, { scope: 'all', status: ['pendiente', 'pospuesto'], limit: 500 }),
            ]);
            setHealth(healthResponse);
            setVisits(visitsResponse?.items || []);
            setNotes(notesResponse?.items || []);
            setReminders(remindersResponse?.items || []);
        } catch (requestError) {
            setError(requestError.message || 'No se pudo cargar el control administrativo.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [query, token]);

    useEffect(() => {
        const timer = setTimeout(() => load(), query ? 280 : 0);
        return () => clearTimeout(timer);
    }, [load, refreshKey, query]);

    const filteredReminders = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return reminders;
        return reminders.filter((item) => [
            item.titulo,
            item.mensaje,
            item.visita_titulo,
            item.nota_titulo,
            item.cliente_nombre,
            item.recordatorio_usuario,
        ].some((value) => String(value || '').toLowerCase().includes(normalized)));
    }, [query, reminders]);

    const runRepair = async () => {
        if (!pendingRepair) return;
        setWorking(true);
        try {
            const result = await agendaClient.adminRepair(token, pendingRepair.id);
            toast.success(`${pendingRepair.title}: ${translateCurrent(Number(result?.affected) === 1 ? 'Un registro corregido' : '{count} registros corregidos', { count: number(result?.affected) })}`);
            setPendingRepair(null);
            await load({ silent: true });
            onChanged?.();
        } catch (requestError) {
            toast.error(requestError.message || 'No se pudo ejecutar la corrección.');
        } finally {
            setWorking(false);
        }
    };

    const removeReminder = async () => {
        if (!deleteReminderId) return;
        setWorking(true);
        try {
            await agendaClient.deleteReminder(token, deleteReminderId);
            toast.success(translateCurrent('Recordatorio eliminado definitivamente'));
            setDeleteReminderId(null);
            await load({ silent: true });
            onChanged?.();
        } catch (requestError) {
            toast.error(requestError.message || 'No se pudo eliminar el recordatorio.');
        } finally {
            setWorking(false);
        }
    };

    const summary = health?.summary || {};
    const issueCount = [
        'visitas_valores_invalidos',
        'notas_valores_invalidos',
        'recordatorios_estado_invalido',
        'visitas_sin_responsable',
        'notas_sin_responsable',
        'visitas_sin_creador_valido',
        'notas_sin_autor_valido',
        'visitas_cliente_inexistente',
        'notas_cliente_inexistente',
        'visitas_fecha_invalida',
        'avisos_de_visitas_finalizadas',
        'avisos_de_notas_cerradas',
        'avisos_pospuestos_vencidos',
        'avisos_sin_responsable_valido',
        'notas_imagenes_sin_carpeta',
        'relaciones_desincronizadas',
    ].reduce((total, key) => total + (Number(summary[key]) || 0), 0);

    if (loading && !health) return <LocalizedElement><LoadingPanel label="Revisando integridad y permisos…" /></LocalizedElement>;

    return (
        <div className="agenda2-admin-grid">
            <section className="agenda2-admin-intro">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="agenda2-admin-shield"><ShieldCheck size={24} /></span>
                    <div className="min-w-0">
                        <p className="cjm-kicker"><TranslatedText>Control administrativo</TranslatedText></p>
                        <h2><TranslatedText>Gestión y mantenimiento de Agenda</TranslatedText></h2>
                        <p><TranslatedText>Revisa incoherencias, abre cualquier registro y aplica correcciones seguras sin acceder directamente a PostgreSQL.</TranslatedText></p>
                    </div>
                </div>
                <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => load()} disabled={loading}>
                    <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> <TranslatedText>Actualizar revisión</TranslatedText>
                </button>
            </section>

            <div className="agenda2-admin-metrics">
                <div><CalendarClock size={18} /><span><small><TranslatedText>Visitas</TranslatedText></small><strong>{number(summary.visitas_total)}</strong></span></div>
                <div><FileText size={18} /><span><small><TranslatedText>Notas</TranslatedText></small><strong>{number(summary.notas_total)}</strong></span></div>
                <div><BellRing size={18} /><span><small><TranslatedText>Avisos activos</TranslatedText></small><strong>{number(summary.recordatorios_activos)}</strong></span></div>
                <div className={issueCount ? 'agenda2-admin-metric-warning' : 'agenda2-admin-metric-ok'}>
                    {issueCount ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                    <span><small><TranslatedText>Incidencias detectadas</TranslatedText></small><strong>{number(issueCount)}</strong></span>
                </div>
            </div>

            <LocalizedElement><nav className="agenda2-admin-tabs" aria-label="Herramientas administrativas">
                {sections.map(({ id, label, icon: Icon }) => (
                    <button type="button" key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
                        <Icon size={17} /> {label}
                    </button>
                ))}
            </nav></LocalizedElement>

            {section !== 'diagnostico' && (
                <label className="agenda2-search-field agenda2-admin-search">
                    <Search size={17} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${section === 'avisos' ? 'recordatorios' : section} por título, cliente o responsable`} />
                </label>
            )}

            {error && <div className="agenda2-error" role="alert">{error}</div>}

            {section === 'diagnostico' && (
                <div className="grid gap-5">
                    <section className="agenda2-admin-repairs">
                        <div className="agenda2-admin-section-title">
                            <div><h3><TranslatedText>Correcciones seguras</TranslatedText></h3><p><TranslatedText>Solo se modifican registros que cumplen exactamente la incidencia descrita.</TranslatedText></p></div>
                        </div>
                        <div className="agenda2-admin-repair-grid">
                            {repairs.map((repair) => {
                                const Icon = repair.icon;
                                return (
                                    <button type="button" key={repair.id} onClick={() => setPendingRepair(repair)}>
                                        <span><Icon size={19} /></span>
                                        <strong>{repair.title}</strong>
                                        <small>{repair.description}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="agenda2-admin-issues">
                        <div className="agenda2-admin-section-title">
                            <div><h3><TranslatedText>Incidencias encontradas</TranslatedText></h3><p><TranslatedText>Abre el elemento relacionado o ejecuta la corrección recomendada.</TranslatedText></p></div>
                            <span className="agenda2-badge">{number(issueCount)}</span>
                        </div>
                        {(health?.issues || []).length ? (
                            <div className="grid gap-2">
                                {health.issues.map((issue, index) => (
                                    <button
                                        type="button"
                                        key={`${issue.tipo}-${issue.entidad}-${issue.entidad_id}-${index}`}
                                        className={`agenda2-admin-issue agenda2-admin-issue-${issue.severidad}`}
                                        onClick={() => {
                                            if (issue.entidad === 'visita') onVisit?.({ id: Number(issue.entidad_id) });
                                            if (issue.entidad === 'nota') onNote?.({ id: Number(issue.entidad_id) });
                                            if (issue.entidad === 'recordatorio') {
                                                setSection('avisos');
                                                setQuery(issue.titulo || '');
                                            }
                                        }}
                                    >
                                        <AlertTriangle size={17} />
                                        <span className="min-w-0"><strong>{issue.titulo}</strong><small>{issue.detalle}</small></span>
                                        <span className="agenda2-badge">{issue.entidad}</span>
                                    </button>
                                ))}
                            </div>
                        ) : <LocalizedElement><EmptyAgenda icon={CheckCircle2} title="No se han detectado incoherencias" description="Las relaciones, fechas, responsables y recordatorios revisados son coherentes." /></LocalizedElement>}
                    </section>
                </div>
            )}

            {section === 'visitas' && (
                visits.length ? <div className="agenda2-admin-list">{visits.map((visit) => (
                    <button type="button" key={visit.id} onClick={() => onVisit?.(visit)}>
                        <span className="agenda2-date-tile"><CalendarClock size={18} /></span>
                        <span className="min-w-0 flex-1 text-left"><strong>{visit.titulo || 'Visita comercial'}</strong><small>{visit.cliente_nombre || visit.cliente_id || 'Sin cliente'} · {formatDateTime(visit.fecha)}</small><span className="mt-2 flex flex-wrap gap-2"><StatusBadge status={visit.estado} /><PriorityBadge priority={visit.prioridad} /></span></span>
                        <span className="agenda2-admin-open"><TranslatedText>Gestionar</TranslatedText></span>
                    </button>
                ))}</div> : <LocalizedElement><EmptyAgenda title="No hay visitas que coincidan" /></LocalizedElement>
            )}

            {section === 'notas' && (
                notes.length ? <div className="agenda2-admin-list">{notes.map((note) => (
                    <button type="button" key={note.id} onClick={() => onNote?.(note)}>
                        <span className="agenda2-date-tile agenda2-date-note"><FileText size={18} /></span>
                        <span className="min-w-0 flex-1 text-left"><strong>{note.titulo || 'Nota'}</strong><small>{note.cliente_nombre || 'Sin cliente'} · {formatDateTime(note.fechaactualizado || note.fechacreado)}</small><span className="mt-2 flex flex-wrap gap-2"><StatusBadge status={note.estado} kind="note" /><PriorityBadge priority={note.prioridad} /></span></span>
                        <span className="agenda2-admin-open"><TranslatedText>Gestionar</TranslatedText></span>
                    </button>
                ))}</div> : <LocalizedElement><EmptyAgenda title="No hay notas que coincidan" /></LocalizedElement>
            )}

            {section === 'avisos' && (
                filteredReminders.length ? <div className="agenda2-admin-list">{filteredReminders.map((reminder) => (
                    <article key={reminder.id} className="agenda2-admin-reminder">
                        <span className="agenda2-date-tile"><BellRing size={18} /></span>
                        <span className="min-w-0 flex-1"><strong>{reminder.titulo || reminder.visita_titulo || reminder.nota_titulo || 'Recordatorio'}</strong><small>{reminder.cliente_nombre || 'Sin cliente'} · {formatDateTime(reminder.fecha_efectiva || reminder.fecha_recordatorio)}</small><small><TranslatedText>Responsable:</TranslatedText> {reminder.recordatorio_usuario || reminder.usuario_id}</small></span>
                        <LocalizedElement><button type="button" className="agenda2-danger-icon" onClick={() => setDeleteReminderId(reminder.id)} aria-label="Eliminar recordatorio"><Trash2 size={17} /></button></LocalizedElement>
                    </article>
                ))}</div> : <LocalizedElement><EmptyAgenda icon={BellRing} title="No hay recordatorios activos" /></LocalizedElement>
            )}

            {pendingRepair && (
                <LocalizedElement><div className="agenda2-admin-confirm" role="alertdialog" aria-modal="true" aria-label="Confirmar mantenimiento">
                    <div>
                        <span><Wrench size={22} /></span>
                        <h3>{pendingRepair.title}</h3>
                        <p>{pendingRepair.description}</p>
                        <p className="mt-2 text-sm cjm-muted"><TranslatedText>La operación quedará registrada en el historial administrativo.</TranslatedText></p>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" className="cjm-icon-button min-h-11 rounded-xl px-4" onClick={() => setPendingRepair(null)} disabled={working}><TranslatedText>Cancelar</TranslatedText></button>
                            <button type="button" className="cjm-primary-button min-h-11 rounded-xl px-5 font-semibold" onClick={runRepair} disabled={working}>{working ? 'Corrigiendo…' : 'Aplicar corrección'}</button>
                        </div>
                    </div>
                </div></LocalizedElement>
            )}

            {deleteReminderId && (
                <LocalizedElement><div className="agenda2-admin-confirm" role="alertdialog" aria-modal="true" aria-label="Confirmar eliminación">
                    <div>
                        <span className="agenda2-admin-danger"><Trash2 size={22} /></span>
                        <h3><TranslatedText>Eliminar recordatorio definitivamente</TranslatedText></h3>
                        <p><TranslatedText>Se eliminará únicamente este aviso. La visita o nota relacionada se conservará.</TranslatedText></p>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" className="cjm-icon-button min-h-11 rounded-xl px-4" onClick={() => setDeleteReminderId(null)} disabled={working}><TranslatedText>Cancelar</TranslatedText></button>
                            <button type="button" className="agenda2-danger-button min-h-11 rounded-xl px-5 font-semibold" onClick={removeReminder} disabled={working}>{working ? 'Eliminando…' : 'Eliminar aviso'}</button>
                        </div>
                    </div>
                </div></LocalizedElement>
            )}
        </div>
    );
}
