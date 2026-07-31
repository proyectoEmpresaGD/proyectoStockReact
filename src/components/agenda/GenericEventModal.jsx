import React, { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import { toast } from 'react-toastify';

export default function GenericEventModal({ slot, onClose, onSave }) {
    const defaultDateTime = slot?.start
        ? new Date(slot.start).toISOString().slice(0, 16)
        : '';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateTime, setDateTime] = useState(defaultDateTime);

    const handleSave = (event) => {
        event.preventDefault();
        if (!title.trim()) {
            toast.warning('El título es obligatorio.');
            return;
        }
        if (!dateTime) {
            toast.warning('La fecha y la hora son obligatorias.');
            return;
        }

        const start = new Date(dateTime);
        onSave({
            id: `evt-${Date.now()}`,
            title: title.trim(),
            descripcion: description.trim(),
            start,
            end: new Date(start.getTime() + 3600000),
            type: 'event',
        });
        toast.success('Evento añadido a la agenda.');
        onClose();
    };

    return (
        <div className="cjm-modal-backdrop z-[1150]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <form className="cjm-modal sm:max-w-lg" onSubmit={handleSave} aria-labelledby="generic-event-title">
                <header className="cjm-modal-header flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="cjm-icon-tile h-11 w-11 shrink-0 rounded-2xl"><CalendarPlus className="h-5 w-5" aria-hidden="true" /></span>
                        <div><p className="cjm-kicker">Agenda</p><h2 id="generic-event-title" className="mt-1 text-xl font-semibold app-text">Nuevo evento</h2></div>
                    </div>
                    <button type="button" onClick={onClose} className="cjm-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" aria-label="Cerrar"><X className="h-5 w-5" /></button>
                </header>

                <div className="cjm-modal-body space-y-4 px-5 py-5 sm:px-6">
                    <label><span className="cjm-control-label">Título</span><input type="text" value={title} onChange={(event) => setTitle(event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" placeholder="Nombre del evento" autoFocus /></label>
                    <label><span className="cjm-control-label">Descripción</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="cjm-input min-h-28 rounded-xl px-3 py-2.5" rows={4} placeholder="Información adicional…" /></label>
                    <label>
                        <span className="cjm-control-label">Fecha y hora</span>
                        <span className="flex min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                            <input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none" />
                        </span>
                    </label>
                </div>

                <footer className="cjm-modal-footer grid gap-2 border-t px-5 py-4 sm:grid-cols-2 sm:px-6">
                    <button type="button" onClick={onClose} className="cjm-ghost-button">Cancelar</button>
                    <button type="submit" className="cjm-primary-button">Crear evento</button>
                </footer>
            </form>
        </div>
    );
}
