import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthContext } from '../../Auth/AuthContext';
import { agendaClient } from '../../services/agendaClient';
import { AgendaDrawer } from '../agenda2/AgendaUI';
import ClientVisitHistory from '../agenda2/ClientVisitHistory';
import NoteDetailDrawer from '../agenda2/NoteDetailDrawer';
import NoteFormDrawer from '../agenda2/NoteFormDrawer';
import VisitDetailDrawer from '../agenda2/VisitDetailDrawer';
import VisitFormDrawer from '../agenda2/VisitFormDrawer';
import '../agenda2/Agenda2.css';

export default function VisitModal({
    modalVisible,
    selectedClient,
    selectedClientId,
    closeModal,
    updateLastVisitDate,
}) {
    const { token, user } = useAuthContext();
    const client = useMemo(() => selectedClient || {
        codclien: selectedClientId,
        razclien: selectedClientId,
    }, [selectedClient, selectedClientId]);

    const [team, setTeam] = useState([]);
    const [availableVisits, setAvailableVisits] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);
    const [visitForm, setVisitForm] = useState({ open: false, visit: null });
    const [visitDetail, setVisitDetail] = useState({ open: false, visit: null });
    const [noteForm, setNoteForm] = useState({ open: false, note: null, visit: null });
    const [noteDetail, setNoteDetail] = useState({ open: false, note: null });

    useEffect(() => {
        if (!modalVisible || !token) return undefined;
        const controller = new AbortController();
        agendaClient.team(token, controller.signal)
            .then((response) => setTeam(response?.items || []))
            .catch((error) => error.name !== 'AbortError' && toast.error(error.message || 'No se pudo cargar el equipo comercial'));
        return () => controller.abort();
    }, [modalVisible, token]);

    useEffect(() => {
        if (!modalVisible) {
            setVisitForm({ open: false, visit: null });
            setVisitDetail({ open: false, visit: null });
            setNoteForm({ open: false, note: null, visit: null });
            setNoteDetail({ open: false, note: null });
        }
    }, [modalVisible]);

    const openVisit = async (visit) => {
        try {
            const full = visit?.resultado !== undefined && visit?.total_notas !== undefined
                ? visit
                : await agendaClient.getVisit(token, visit.id);
            setVisitDetail({ open: true, visit: full });
        } catch (error) {
            toast.error(error.message || 'No se pudo abrir la visita');
        }
    };

    const openNote = async (note) => {
        try {
            const full = note?.contenido !== undefined ? note : await agendaClient.getNote(token, note.id);
            setNoteDetail({ open: true, note: full });
        } catch (error) {
            toast.error(error.message || 'No se pudo abrir la nota');
        }
    };

    const afterVisitSaved = (saved) => {
        setRefreshKey((value) => value + 1);
        setAvailableVisits((current) => {
            const map = new Map(current.map((item) => [Number(item.id), item]));
            map.set(Number(saved.id), saved);
            return [...map.values()];
        });
        setVisitDetail({ open: true, visit: saved });
        if (saved.estado === 'completada') updateLastVisitDate?.(client.codclien, saved.fecha);
    };

    const afterVisitDeleted = (visit) => {
        setAvailableVisits((current) => current.filter((item) => Number(item.id) !== Number(visit?.id)));
        setVisitDetail({ open: false, visit: null });
        setRefreshKey((value) => value + 1);
    };

    const afterNoteSaved = (saved) => {
        setNoteDetail((current) => Number(current.note?.id) === Number(saved.id) ? { ...current, note: saved } : current);
        setRefreshKey((value) => value + 1);
    };

    if (!modalVisible) return null;

    const footer = (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeModal} className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium"><X size={17} /> Cerrar</button>
            <button type="button" onClick={() => setVisitForm({ open: true, visit: null })} className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold"><CalendarPlus2 size={17} /> Nueva visita</button>
        </div>
    );

    return (
        <>
            <AgendaDrawer
                open={modalVisible}
                onClose={closeModal}
                title={client.razclien || `Cliente ${client.codclien}`}
                eyebrow="Actividad comercial del cliente"
                footer={footer}
                size="xl"
            >
                <ClientVisitHistory
                    token={token}
                    clientId={client.codclien}
                    clientName={client.razclien || client.codclien}
                    refreshKey={refreshKey}
                    onVisit={openVisit}
                    onNewVisit={() => { setVisitDetail({ open: false, visit: null }); setVisitForm({ open: true, visit: null }); }}
                    onLoaded={setAvailableVisits}
                />
            </AgendaDrawer>

            <VisitFormDrawer
                open={visitForm.open}
                token={token}
                users={team}
                currentUser={user}
                visit={visitForm.visit}
                initialClient={client}
                onClose={() => setVisitForm({ open: false, visit: null })}
                onSaved={afterVisitSaved}
            />

            <VisitDetailDrawer
                open={visitDetail.open}
                token={token}
                visit={visitDetail.visit}
                currentUser={user}
                refreshKey={refreshKey}
                onClose={() => setVisitDetail({ open: false, visit: null })}
                onEdit={(visit) => { setVisitDetail({ open: false, visit: null }); setVisitForm({ open: true, visit }); }}
                onCreateNote={(visit) => setNoteForm({ open: true, note: null, visit })}
                onNote={openNote}
                onVisit={openVisit}
                onNewVisit={() => { setVisitDetail({ open: false, visit: null }); setVisitForm({ open: true, visit: null }); }}
                onChanged={afterVisitSaved}
                onDeleted={afterVisitDeleted}
            />

            <NoteFormDrawer
                open={noteForm.open}
                token={token}
                users={team}
                currentUser={user}
                note={noteForm.note}
                initialVisit={noteForm.visit}
                availableVisits={availableVisits}
                onClose={() => setNoteForm({ open: false, note: null, visit: null })}
                onSaved={afterNoteSaved}
            />

            <NoteDetailDrawer
                open={noteDetail.open}
                token={token}
                note={noteDetail.note}
                currentUser={user}
                onClose={() => setNoteDetail({ open: false, note: null })}
                onEdit={(note) => { setNoteDetail({ open: false, note: null }); setNoteForm({ open: true, note, visit: null }); }}
                onChanged={afterNoteSaved}
                onDeleted={() => { setRefreshKey((value) => value + 1); setNoteDetail({ open: false, note: null }); }}
                onVisit={(visit) => { setNoteDetail({ open: false, note: null }); openVisit(visit); }}
            />
        </>
    );
}
