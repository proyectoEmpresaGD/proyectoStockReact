import { translateCurrent } from '../../i18n/translations.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import React, { useEffect, useState } from 'react';
import {
    Archive,
    ArchiveRestore,
    BellRing,
    CalendarClock,
    Edit3,
    FileImage,
    History,
    Link2,
    Plus,
    Star,
    Trash2,
    UserRound,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { agendaClient } from '../../services/agendaClient';
import { AgendaDrawer, LoadingPanel, PriorityBadge, StatusBadge } from './AgendaUI';
import { formatDateTime, NOTE_TYPES } from './agendaUtils';

export default function NoteDetailDrawer({
    open,
    token,
    note: initialNote,
    currentUser,
    onClose,
    onEdit,
    onChanged,
    onDeleted,
    onVisit,
}) {
    const [note, setNote] = useState(initialNote || null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [reminderOpen, setReminderOpen] = useState(false);
    const [reminderDate, setReminderDate] = useState('');
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !initialNote?.id) return undefined;
        setNote(initialNote);
        setConfirmDelete(false);
        setReminderOpen(false);
        setReminderDate('');
        setError('');
        const controller = new AbortController();
        setLoading(true);
        Promise.all([
            agendaClient.getNote(token, initialNote.id, controller.signal),
            agendaClient.history(token, { note_id: initialNote.id }, controller.signal),
            agendaClient.listReminders(token, { status: ['pendiente', 'pospuesto'], note_id: initialNote.id, limit: 100 }, controller.signal),
        ]).then(([noteResponse, historyResponse, reminderResponse]) => {
            setNote(noteResponse);
            setHistory(historyResponse?.items || []);
            setReminders(reminderResponse?.items || []);
        }).catch((requestError) => requestError.name !== 'AbortError' && setError(requestError.message))
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [initialNote, open, token]);

    const isAdmin = String(currentUser?.role || '').trim().toLowerCase() === 'admin';
    const canEdit = isAdmin || Number(currentUser?.id) === Number(note?.idusuario);
    const noteClosed = ['completada', 'archivada'].includes(note?.estado);
    const typeLabel = NOTE_TYPES.find((item) => item.value === note?.tipo)?.label || note?.tipo || 'Nota general';

    const remove = async () => {
        setWorking(true); setError('');
        try {
            await agendaClient.deleteNote(token, note.id);
            toast.success(translateCurrent('Nota eliminada'));
            onDeleted?.(note);
            onClose?.();
        } catch (requestError) {
            setError(requestError.message);
        } finally { setWorking(false); }
    };

    const setArchiveState = async () => {
        setWorking(true); setError('');
        try {
            const data = new FormData();
            data.append('estado', note.estado === 'archivada' ? 'activa' : 'archivada');
            const updated = await agendaClient.updateNote(token, note.id, data);
            setNote(updated);
            setReminders([]);
            toast.success(updated.estado === 'archivada' ? 'Nota archivada' : 'Nota restaurada');
            onChanged?.(updated);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setWorking(false); }
    };

    const addReminder = async () => {
        if (!reminderDate) return setError(translateCurrent('Selecciona la fecha y hora del recordatorio.'));
        const date = new Date(reminderDate);
        if (Number.isNaN(date.getTime()) || date <= new Date()) return setError(translateCurrent('El recordatorio debe tener una fecha futura válida.'));
        setWorking(true); setError('');
        try {
            const created = await agendaClient.createReminder(token, {
                nota_id: note.id,
                fecha_recordatorio: date.toISOString(),
                titulo: `Recordatorio: ${note.titulo}`,
                mensaje: note.cliente_nombre || note.contenido,
            });
            setReminders((current) => [...current, created]);
            setReminderDate('');
            setReminderOpen(false);
            toast.success(translateCurrent('Recordatorio guardado para el responsable de la nota'));
        } catch (requestError) {
            setError(requestError.message);
        } finally { setWorking(false); }
    };

    const removeReminder = async (reminder) => {
        setWorking(true); setError('');
        try {
            await agendaClient.deleteReminder(token, reminder.id);
            setReminders((current) => current.filter((item) => Number(item.id) !== Number(reminder.id)));
            toast.success(translateCurrent('Recordatorio eliminado'));
        } catch (requestError) {
            setError(requestError.message);
        } finally { setWorking(false); }
    };

    const footer = canEdit ? (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" className="agenda2-danger-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => setConfirmDelete(true)}><Trash2 size={17} /> <TranslatedText>Eliminar</TranslatedText></button>
            <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={setArchiveState} disabled={working}>{note?.estado === 'archivada' ? <ArchiveRestore size={17} /> : <Archive size={17} />} {note?.estado === 'archivada' ? 'Restaurar' : 'Archivar'}</button>
            <button type="button" className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-semibold" onClick={() => onEdit?.(note)}><Edit3 size={17} /> <TranslatedText>Editar nota</TranslatedText></button>
        </div>
    ) : null;

    return (
        <AgendaDrawer open={open} onClose={onClose} title={note?.titulo || 'Detalle de nota'} eyebrow={note?.cliente_nombre || typeLabel} footer={footer} size="xl">
            {loading && !note ? <LoadingPanel /> : note && (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={note.estado} kind="note" />
                        <PriorityBadge priority={note.prioridad} />
                        <span className="agenda2-badge">{typeLabel}</span>
                        {note.destacada && <span className="agenda2-badge agenda2-featured"><Star size={12} fill="currentColor" /> <TranslatedText>Destacada</TranslatedText></span>}
                    </div>

                    <div className="agenda2-detail-grid mt-5">
                        <div><CalendarClock size={18} /><span><small><TranslatedText>Creada</TranslatedText></small><strong>{formatDateTime(note.fechacreado)}</strong></span></div>
                        <div><CalendarClock size={18} /><span><small><TranslatedText>Seguimiento</TranslatedText></small><strong>{formatDateTime(note.fecha_seguimiento, 'Sin fecha')}</strong></span></div>
                        <div><UserRound size={18} /><span><small><TranslatedText>Autor</TranslatedText></small><strong>{note.autor_nombre || note.autor || 'Usuario'}</strong></span></div>
                        <div><UserRound size={18} /><span><small><TranslatedText>Responsable</TranslatedText></small><strong>{note.responsable || 'Sin asignar'}</strong></span></div>
                    </div>

                    <section className="agenda2-content-block mt-5"><h3><TranslatedText>Contenido</TranslatedText></h3><p className="whitespace-pre-wrap">{note.contenido}</p></section>

                    <section className="agenda2-content-block mt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2"><BellRing size={17} /><h3><TranslatedText>Recordatorios</TranslatedText></h3></div>
                            {!noteClosed && <button type="button" className="agenda2-link-button" onClick={() => setReminderOpen((value) => !value)}><Plus size={15} /> <TranslatedText>Añadir</TranslatedText></button>}
                        </div>
                        {reminders.length > 0 ? <div className="mt-3 grid gap-2">{reminders.map((reminder) => {
                            const canDeleteReminder = isAdmin || Number(reminder.usuario_id) === Number(currentUser?.id);
                            return <div key={reminder.id} className="agenda2-reminder-row"><CalendarClock size={16} /><span className="min-w-0 flex-1"><strong>{formatDateTime(reminder.fecha_efectiva || reminder.fecha_recordatorio)}</strong>{reminder.recordatorio_usuario && <small><TranslatedText>Responsable:</TranslatedText> {reminder.recordatorio_usuario}</small>}</span>{canDeleteReminder && <LocalizedElement><button type="button" className="agenda2-danger-icon" onClick={() => removeReminder(reminder)} disabled={working} aria-label="Eliminar recordatorio"><Trash2 size={15} /></button></LocalizedElement>}</div>;
                        })}</div> : <p className="mt-2 text-sm cjm-muted"><TranslatedText>No hay recordatorios pendientes.</TranslatedText></p>}
                        {reminderOpen && <div className="agenda2-action-panel mt-4"><h4 className="font-semibold app-text"><TranslatedText>Nuevo recordatorio</TranslatedText></h4><p className="mt-1 text-sm cjm-muted"><TranslatedText>El aviso se asignará al responsable actual de la nota.</TranslatedText></p><label className="agenda2-field mt-3"><span><TranslatedText>Fecha y hora</TranslatedText></span><div className="agenda2-native-date"><input type="datetime-local" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} /></div></label><div className="mt-3 flex gap-2"><button type="button" className="cjm-icon-button min-h-11 flex-1 rounded-xl" onClick={() => setReminderOpen(false)}><TranslatedText>Cancelar</TranslatedText></button><button type="button" className="cjm-primary-button min-h-11 flex-1 rounded-xl font-semibold" onClick={addReminder} disabled={working}>{working ? 'Guardando…' : 'Guardar aviso'}</button></div></div>}
                    </section>

                    {note.visitas_relacionadas?.length > 0 && (
                        <section className="agenda2-content-block mt-4">
                            <div className="flex items-center gap-2"><Link2 size={17} /><h3><TranslatedText>Visitas relacionadas</TranslatedText></h3></div>
                            <div className="mt-3 grid gap-2">
                                {note.visitas_relacionadas.map((visit) => <button key={visit.id} type="button" className="agenda2-related-visit" onClick={() => onVisit?.(visit)}><span><strong>{visit.titulo || 'Visita'}</strong><small>{visit.cliente_nombre || visit.cliente_id || ''} · {formatDateTime(visit.fecha)}</small></span><span>›</span></button>)}
                            </div>
                        </section>
                    )}

                    {note.imagenes?.length > 0 && (
                        <section className="agenda2-content-block mt-4">
                            <div className="flex items-center gap-2"><FileImage size={17} /><h3><TranslatedText>Imágenes</TranslatedText></h3></div>
                            <div className="agenda2-note-gallery mt-3">{note.imagenes.map((image) => <a key={image} href={image} target="_blank" rel="noreferrer"><LocalizedElement><img src={image} alt="Adjunto de la nota" /></LocalizedElement></a>)}</div>
                        </section>
                    )}

                    {history.length > 0 && <section className="agenda2-content-block mt-4"><div className="flex items-center gap-2"><History size={17} /><h3><TranslatedText>Actividad reciente</TranslatedText></h3></div><div className="agenda2-timeline mt-4">{history.slice(0, 8).map((entry) => <div key={entry.id}><span><History size={14} /></span><div><strong>{String(entry.accion || '').replaceAll('_', ' ')}</strong><p>{entry.username || 'Sistema'} · {formatDateTime(entry.created_at)}</p></div></div>)}</div></section>}
                </>
            )}
            {confirmDelete && <div className="agenda2-action-panel mt-5"><h3><TranslatedText>¿Eliminar esta nota?</TranslatedText></h3><p className="mt-1 text-sm cjm-muted"><TranslatedText>Se eliminarán sus avisos y relaciones con visitas. El historial conservará una copia de los datos anteriores y la limpieza de imágenes se realizará de forma segura en el servidor.</TranslatedText></p><div className="mt-4 flex gap-2"><button type="button" className="cjm-icon-button min-h-11 flex-1 rounded-xl" onClick={() => setConfirmDelete(false)}><TranslatedText>Volver</TranslatedText></button><button type="button" className="agenda2-danger-button min-h-11 flex-1 rounded-xl font-semibold" onClick={remove} disabled={working}>{working ? 'Eliminando…' : 'Eliminar definitivamente'}</button></div></div>}
            {error && <div className="agenda2-error mt-5">{error}</div>}
        </AgendaDrawer>
    );
}
