import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, LayoutDashboard, ListTodo, Plus, ShieldCheck, StickyNote, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuthContext } from '../../Auth/AuthContext';
import { agendaClient } from '../../services/agendaClient';
import AgendaToday from './AgendaToday';
import AgendaCalendarView from './AgendaCalendarView';
import AgendaFollowUps from './AgendaFollowUps';
import AgendaNotesView from './AgendaNotesView';
import AgendaAdminPanel from './AgendaAdminPanel';
import VisitFormDrawer from './VisitFormDrawer';
import VisitDetailDrawer from './VisitDetailDrawer';
import NoteFormDrawer from './NoteFormDrawer';
import NoteDetailDrawer from './NoteDetailDrawer';
import './Agenda2.css';

const baseTabs = [
    { id: 'hoy', label: 'Hoy', icon: LayoutDashboard, description: 'Tu jornada' },
    { id: 'calendario', label: 'Calendario', icon: CalendarDays, description: 'Planificación' },
    { id: 'seguimientos', label: 'Seguimientos', icon: ListTodo, description: 'Próximas acciones' },
    { id: 'notas', label: 'Notas', icon: StickyNote, description: 'Información comercial' },
];

const adminTab = { id: 'administracion', label: 'Administración', icon: ShieldCheck, description: 'Control y errores' };
const validTabs = new Set([...baseTabs, adminTab].map((tab) => tab.id));

export default function AgendaWorkspace({ initialTab = 'hoy' }) {
    const { token, user } = useAuthContext();
    const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
    const visibleTabs = useMemo(() => isAdmin ? [...baseTabs, adminTab] : baseTabs, [isAdmin]);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(validTabs.has(requestedTab) ? requestedTab : initialTab);
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [team, setTeam] = useState([]);
    const [availableVisits, setAvailableVisits] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);

    const [visitForm, setVisitForm] = useState({ open: false, visit: null, date: null, client: null });
    const [visitDetail, setVisitDetail] = useState({ open: false, visit: null });
    const [noteForm, setNoteForm] = useState({ open: false, note: null, visit: null });
    const [noteDetail, setNoteDetail] = useState({ open: false, note: null });
    const [quickMenu, setQuickMenu] = useState(false);
    const notifiedRef = useRef(new Set());

    const mergeVisits = useCallback((items) => {
        setAvailableVisits((current) => {
            const map = new Map(current.map((item) => [Number(item.id), item]));
            (items || []).forEach((item) => item?.id && map.set(Number(item.id), { ...map.get(Number(item.id)), ...item }));
            return [...map.values()];
        });
    }, []);

    const notifyDueReminders = useCallback((reminders = []) => {
        const now = new Date();
        reminders
            .filter((reminder) => new Date(reminder.fecha_efectiva || reminder.fecha_recordatorio) <= now)
            .forEach((reminder) => {
                if (notifiedRef.current.has(reminder.id)) return;
                notifiedRef.current.add(reminder.id);
                const title = reminder.titulo || reminder.visita_titulo || reminder.nota_titulo || 'Recordatorio de agenda';
                const detail = reminder.cliente_nombre || reminder.mensaje || '';
                toast.info(detail ? `${title} · ${detail}` : title, { autoClose: 7000 });
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try { new Notification(title, { body: detail }); }
                    catch (notificationError) { console.debug('Notificación nativa no disponible', notificationError); }
                }
            });
    }, []);

    const loadOverview = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setOverviewLoading(true);
        try {
            const response = await agendaClient.overview(token);
            setOverview(response);
            mergeVisits([...(response?.today || []), ...(response?.overdue || []), ...(response?.upcoming || [])]);
            notifyDueReminders(response?.reminders || []);
            return response;
        } catch (error) {
            if (!silent) toast.error(error.message || 'No se pudo cargar la agenda');
            return null;
        } finally {
            if (!silent) setOverviewLoading(false);
        }
    }, [mergeVisits, notifyDueReminders, token]);

    useEffect(() => {
        loadOverview();
        const controller = new AbortController();
        Promise.all([
            agendaClient.team(token, controller.signal),
            agendaClient.listVisits(token, { limit: 500, order: 'desc' }, controller.signal),
        ]).then(([teamResponse, visitResponse]) => {
            setTeam(teamResponse?.items || []);
            mergeVisits(visitResponse?.items || []);
        }).catch((error) => error.name !== 'AbortError' && console.error(error));
        return () => controller.abort();
    }, [loadOverview, mergeVisits, token]);

    useEffect(() => {
        const timer = setInterval(() => loadOverview({ silent: true }), 60_000);
        return () => clearInterval(timer);
    }, [loadOverview]);

    useEffect(() => {
        if (validTabs.has(requestedTab) && requestedTab !== activeTab) setActiveTab(requestedTab);
    }, [activeTab, requestedTab]);

    useEffect(() => {
        if (user && !isAdmin && activeTab === 'administracion') {
            setActiveTab('hoy');
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'hoy');
            setSearchParams(next, { replace: true });
        }
    }, [activeTab, isAdmin, searchParams, setSearchParams, user]);

    useEffect(() => {
        const eventId = searchParams.get('eventId') || searchParams.get('visitId');
        const noteId = searchParams.get('noteId');
        if (eventId) openVisit({ id: Number(eventId) });
        if (noteId) openNote({ id: Number(noteId) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const changeTab = (tab, options = {}) => {
        if (tab === 'administracion' && !isAdmin) return;
        setActiveTab(tab);
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        next.delete('eventId'); next.delete('visitId'); next.delete('noteId');
        if (tab === 'seguimientos' && options.period) next.set('period', options.period);
        else next.delete('period');
        setSearchParams(next, { replace: true });
    };

    const openVisit = async (visit) => {
        let full = visit;
        if (!visit?.fecha || !visit?.titulo) {
            try { full = await agendaClient.getVisit(token, visit.id); }
            catch (error) { return toast.error(error.message); }
        }
        mergeVisits([full]);
        setVisitDetail({ open: true, visit: full });
    };

    const openNote = async (note) => {
        let full = note;
        if (!note?.contenido) {
            try { full = await agendaClient.getNote(token, note.id); }
            catch (error) { return toast.error(error.message); }
        }
        setNoteDetail({ open: true, note: full });
    };

    const afterVisitSaved = (saved) => {
        mergeVisits([saved]);
        setVisitDetail({ open: true, visit: saved });
        setRefreshKey((key) => key + 1);
        loadOverview({ silent: true });
    };

    const afterVisitDeleted = (deleted) => {
        setAvailableVisits((current) => current.filter((item) => Number(item.id) !== Number(deleted?.id)));
        setVisitDetail({ open: false, visit: null });
        setRefreshKey((key) => key + 1);
        loadOverview({ silent: true });
    };

    const afterNoteSaved = (saved) => {
        setNoteDetail((current) => current.open && Number(current.note?.id) === Number(saved.id) ? { ...current, note: saved } : current);
        setRefreshKey((key) => key + 1);
        loadOverview({ silent: true });
    };

    const reminderAction = async (reminder, action) => {
        try {
            if (action === 'snooze') {
                await agendaClient.reminderAction(token, reminder.id, 'snooze', { until: new Date(Date.now() + 60 * 60_000).toISOString() });
                notifiedRef.current.delete(reminder.id);
                toast.success('Recordatorio pospuesto una hora');
            } else {
                await agendaClient.reminderAction(token, reminder.id, action);
            }
            loadOverview({ silent: true });
        } catch (error) { toast.error(error.message); }
    };

    const allAvailableVisits = useMemo(() => [...availableVisits].sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()), [availableVisits]);

    return (
        <div className="agenda2-root">
            <section className="agenda2-hero cjm-hero">
                <div className="relative z-10 min-w-0">
                    <p className="cjm-kicker">CJM · Relación comercial</p>
                    <h1>Agenda y seguimientos</h1>
                    <p>Organiza visitas, notas, recordatorios y próximas acciones desde una única herramienta sincronizada.</p>
                </div>
                <div className="relative z-10 flex flex-col gap-2 sm:flex-row">
                    <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => setNoteForm({ open: true, note: null, visit: null })}><StickyNote size={18} /> Nueva nota</button>
                    <button type="button" className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold" onClick={() => setVisitForm({ open: true, visit: null, date: null, client: null })}><Plus size={18} /> Nueva visita</button>
                </div>
            </section>

            <nav className="agenda2-tabs" aria-label="Secciones de agenda">
                {visibleTabs.map(({ id, label, description, icon: Icon }) => (
                    <button type="button" key={id} className={activeTab === id ? 'active' : ''} onClick={() => changeTab(id)}>
                        <span><Icon size={18} /></span><span><strong>{label}</strong><small>{description}</small></span>
                    </button>
                ))}
            </nav>

            <main className="agenda2-main">
                {activeTab === 'hoy' && <AgendaToday overview={overview} loading={overviewLoading} onVisit={openVisit} onNewVisit={() => setVisitForm({ open: true, visit: null, date: null, client: null })} onNewNote={() => setNoteForm({ open: true, note: null, visit: null })} onOpenTab={changeTab} onReminderAction={reminderAction} />}
                {activeTab === 'calendario' && <AgendaCalendarView key={refreshKey} token={token} users={team} onVisit={openVisit} onNewVisit={(date) => setVisitForm({ open: true, visit: null, date, client: null })} onLoaded={mergeVisits} refreshKey={refreshKey} />}
                {activeTab === 'seguimientos' && <AgendaFollowUps key={refreshKey} token={token} onVisit={openVisit} onNote={openNote} initialPeriod={searchParams.get('period') || 'all'} />}
                {activeTab === 'notas' && <AgendaNotesView token={token} refreshKey={refreshKey} onNote={openNote} onNewNote={() => setNoteForm({ open: true, note: null, visit: null })} />}
                {activeTab === 'administracion' && isAdmin && <AgendaAdminPanel token={token} refreshKey={refreshKey} onVisit={openVisit} onNote={openNote} onChanged={() => { setRefreshKey((key) => key + 1); loadOverview({ silent: true }); }} />}
            </main>

            <div className="agenda2-mobile-fab">
                {quickMenu && <div className="agenda2-fab-menu"><button type="button" onClick={() => { setQuickMenu(false); setNoteForm({ open: true, note: null, visit: null }); }}><StickyNote size={18} /> Nueva nota</button><button type="button" onClick={() => { setQuickMenu(false); setVisitForm({ open: true, visit: null, date: null, client: null }); }}><CalendarDays size={18} /> Nueva visita</button></div>}
                <button type="button" aria-label={quickMenu ? 'Cerrar acciones' : 'Crear nuevo'} onClick={() => setQuickMenu((value) => !value)}>{quickMenu ? <X size={22} /> : <Plus size={23} />}</button>
            </div>

            <VisitFormDrawer open={visitForm.open} token={token} users={team} currentUser={user} visit={visitForm.visit} initialDate={visitForm.date} initialClient={visitForm.client} onClose={() => setVisitForm({ open: false, visit: null, date: null, client: null })} onSaved={afterVisitSaved} />
            <VisitDetailDrawer open={visitDetail.open} token={token} visit={visitDetail.visit} currentUser={user} refreshKey={refreshKey} onClose={() => setVisitDetail({ open: false, visit: null })} onEdit={(visit) => { setVisitDetail({ open: false, visit: null }); setVisitForm({ open: true, visit, date: null, client: null }); }} onCreateNote={(visit) => setNoteForm({ open: true, note: null, visit })} onNote={(note) => { setVisitDetail({ open: false, visit: null }); openNote(note); }} onVisit={openVisit} onNewVisit={(client) => { setVisitDetail({ open: false, visit: null }); setVisitForm({ open: true, visit: null, date: null, client }); }} onChanged={afterVisitSaved} onDeleted={afterVisitDeleted} />
            <NoteFormDrawer open={noteForm.open} token={token} users={team} currentUser={user} note={noteForm.note} initialVisit={noteForm.visit} availableVisits={allAvailableVisits} onClose={() => setNoteForm({ open: false, note: null, visit: null })} onSaved={afterNoteSaved} />
            <NoteDetailDrawer open={noteDetail.open} token={token} note={noteDetail.note} currentUser={user} onClose={() => setNoteDetail({ open: false, note: null })} onEdit={(note) => { setNoteDetail({ open: false, note: null }); setNoteForm({ open: true, note, visit: null }); }} onChanged={afterNoteSaved} onDeleted={() => { setRefreshKey((key) => key + 1); setNoteDetail({ open: false, note: null }); }} onVisit={(visit) => { setNoteDetail({ open: false, note: null }); openVisit(visit); }} />
        </div>
    );
}
