import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, FileImage, Link2, Loader2, Save, Search, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import { agendaClient } from '../../services/agendaClient';
import { AgendaDrawer, ClientPicker, TeamSelect } from './AgendaUI';
import { formatDateTime, NOTE_STATUS, NOTE_TYPES, PRIORITIES, toLocalInput } from './agendaUtils';

const getImageName = (value) => {
    try {
        return decodeURIComponent(new URL(value).pathname.split('/').pop() || 'imagen');
    } catch {
        return String(value || '').split('/').pop() || 'imagen';
    }
};

export default function NoteFormDrawer({ open, token, users, currentUser, note, initialVisit, availableVisits = [], onClose, onSaved }) {
    const editing = Boolean(note?.id);
    const [client, setClient] = useState(null);
    const [form, setForm] = useState({});
    const [linkedVisits, setLinkedVisits] = useState([]);
    const [existingImages, setExistingImages] = useState([]);
    const [newImages, setNewImages] = useState([]);
    const [visitQuery, setVisitQuery] = useState('');
    const [remoteVisits, setRemoteVisits] = useState([]);
    const [visitsLoading, setVisitsLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        const initialIds = note?.eventos?.map(Number).filter(Boolean)
            || (initialVisit?.id ? [Number(initialVisit.id)] : []);
        setForm({
            titulo: note?.titulo || (initialVisit ? `Seguimiento: ${initialVisit.cliente_nombre || initialVisit.titulo}` : ''),
            contenido: note?.contenido || '',
            tipo: note?.tipo || (initialVisit ? 'seguimiento' : 'general'),
            prioridad: note?.prioridad || 'media',
            estado: note?.estado || 'activa',
            destacada: Boolean(note?.destacada),
            fecha_seguimiento: toLocalInput(note?.fecha_seguimiento),
            assigned_to: note?.assigned_to || currentUser?.id || null,
            recordatorio_fecha: '',
        });
        setClient(note?.cliente_id ? { codclien: note.cliente_id, razclien: note.cliente_nombre || note.cliente_id } : initialVisit?.cliente_id ? { codclien: initialVisit.cliente_id, razclien: initialVisit.cliente_nombre || initialVisit.cliente_id } : null);
        setLinkedVisits(initialIds);
        setExistingImages(note?.imagenes || []);
        setNewImages([]);
        setVisitQuery('');
        setRemoteVisits([]);
        setError('');
    }, [currentUser?.id, initialVisit, note, open]);

    const visitOptions = useMemo(() => {
        const map = new Map();
        [...availableVisits, ...remoteVisits, ...(note?.visitas_relacionadas || []), ...(initialVisit ? [initialVisit] : [])].forEach((visit) => {
            if (visit?.id) map.set(Number(visit.id), visit);
        });
        return [...map.values()].sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
    }, [availableVisits, initialVisit, note, remoteVisits]);


    const filteredVisitOptions = useMemo(() => {
        const normalized = visitQuery.trim().toLowerCase();
        if (!normalized) return visitOptions;
        return visitOptions.filter((visit) => [visit.titulo, visit.descripcion, visit.cliente_nombre, visit.cliente_id]
            .some((value) => String(value || '').toLowerCase().includes(normalized)));
    }, [visitOptions, visitQuery]);


    useEffect(() => {
        if (!open || visitQuery.trim().length < 2) {
            setRemoteVisits([]);
            setVisitsLoading(false);
            return undefined;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setVisitsLoading(true);
            try {
                const response = await agendaClient.listVisits(token, {
                    q: visitQuery.trim(),
                    limit: 50,
                    order: 'desc',
                }, controller.signal);
                setRemoteVisits(response?.items || []);
            } catch (requestError) {
                if (requestError.name !== 'AbortError') setRemoteVisits([]);
            } finally {
                setVisitsLoading(false);
            }
        }, 260);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, token, visitQuery]);

    const newImagePreviews = useMemo(
        () => newImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
        [newImages]
    );

    useEffect(() => () => {
        newImagePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
    }, [newImagePreviews]);

    const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

    const handleImages = (event) => {
        const files = [...event.target.files].filter((file) => file.type.startsWith('image/'));
        if (existingImages.length + newImages.length + files.length > 3) {
            setError('Puedes guardar un máximo de 3 imágenes por nota.');
            return;
        }
        setNewImages((current) => [...current, ...files]);
        event.target.value = '';
    };

    const handleSubmit = async () => {
        setError('');
        if (!form.titulo?.trim()) return setError('Escribe un título para la nota.');
        if (!form.contenido?.trim()) return setError('Escribe el contenido de la nota.');
        const data = new FormData();
        data.append('titulo', form.titulo.trim());
        data.append('contenido', form.contenido.trim());
        data.append('cliente_id', client?.codclien || '');
        data.append('tipo', form.tipo);
        data.append('prioridad', form.prioridad);
        data.append('estado', form.estado);
        data.append('destacada', String(Boolean(form.destacada)));
        data.append('fecha_seguimiento', form.fecha_seguimiento ? new Date(form.fecha_seguimiento).toISOString() : '');
        data.append('assigned_to', form.assigned_to || '');
        if (!editing && form.recordatorio_fecha) {
            const reminderDate = new Date(form.recordatorio_fecha);
            if (Number.isNaN(reminderDate.getTime()) || reminderDate <= new Date()) {
                return setError('El recordatorio debe tener una fecha futura válida.');
            }
            data.append('recordatorio_fecha', reminderDate.toISOString());
        }
        data.append('eventos', JSON.stringify(linkedVisits));
        existingImages.forEach((image) => data.append('keep_imagenes[]', getImageName(image)));
        newImages.forEach((file) => data.append('imagenes', file, file.name));

        setSaving(true);
        try {
            const saved = editing
                ? await agendaClient.updateNote(token, note.id, data)
                : await agendaClient.createNote(token, data);
            toast.success(editing ? 'Nota actualizada' : 'Nota creada correctamente');
            onSaved?.(saved);
            onClose?.();
        } catch (requestError) {
            setError(requestError.message || 'No se pudo guardar la nota.');
        } finally {
            setSaving(false);
        }
    };

    const footer = (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="cjm-icon-button min-h-11 rounded-xl px-5 font-medium" disabled={saving}>Cancelar</button>
            <button type="button" onClick={handleSubmit} className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-semibold" disabled={saving}><Save size={17} /> {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear nota'}</button>
        </div>
    );

    return (
        <AgendaDrawer open={open} onClose={onClose} title={editing ? 'Editar nota' : 'Nueva nota'} eyebrow="Notas y seguimientos" footer={footer} size="xl">
            <div className="agenda2-form-grid">
                <section className="agenda2-form-section sm:col-span-2">
                    <div className="agenda2-section-heading"><span><Star size={19} /></span><div><h3>Contenido</h3><p>Registra el contexto y la próxima acción sin perder la relación comercial.</p></div></div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="agenda2-field sm:col-span-2"><span>Título</span><input className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.titulo || ''} onChange={(event) => setField('titulo', event.target.value)} maxLength={160} placeholder="Ej. Cliente interesado en colección exterior" disabled={saving} /></label>
                        <label className="agenda2-field sm:col-span-2"><span>Contenido</span><textarea className="cjm-input min-h-40 rounded-xl px-3 py-3 text-base" value={form.contenido || ''} onChange={(event) => setField('contenido', event.target.value)} placeholder="Acuerdos, necesidades, muestras, precios y próximos pasos…" disabled={saving} /></label>
                        <ClientPicker token={token} value={client} onChange={setClient} disabled={saving} label="Cliente relacionado (opcional)" />
                        <TeamSelect users={users} value={form.assigned_to} onChange={(value) => setField('assigned_to', value)} disabled={saving} label="Responsable del seguimiento" />
                    </div>
                </section>

                <section className="agenda2-form-section">
                    <div className="agenda2-section-heading"><span><Link2 size={19} /></span><div><h3>Clasificación</h3><p>Ayuda a localizar y priorizar la información.</p></div></div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="agenda2-field"><span>Tipo</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.tipo || 'general'} onChange={(event) => setField('tipo', event.target.value)} disabled={saving}>{NOTE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                        <label className="agenda2-field"><span>Prioridad</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.prioridad || 'media'} onChange={(event) => setField('prioridad', event.target.value)} disabled={saving}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                        <label className="agenda2-field"><span>Estado</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.estado || 'activa'} onChange={(event) => setField('estado', event.target.value)} disabled={saving}>{Object.entries(NOTE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="agenda2-field"><span>Fecha de seguimiento</span><div className="agenda2-native-date"><input type="datetime-local" value={form.fecha_seguimiento || ''} onChange={(event) => setField('fecha_seguimiento', event.target.value)} disabled={saving} /></div></label>
                        {!editing && <label className="agenda2-field sm:col-span-2"><span className="inline-flex items-center gap-1.5"><BellRing size={15} /> Recordatorio opcional</span><div className="agenda2-native-date"><input type="datetime-local" value={form.recordatorio_fecha || ''} onChange={(event) => setField('recordatorio_fecha', event.target.value)} disabled={saving} /></div><small className="cjm-muted">El aviso se guardará para el responsable seleccionado y estará disponible en todos sus dispositivos.</small></label>}
                        <label className="form-check form-switch sm:col-span-2"><input className="form-check-input" type="checkbox" checked={Boolean(form.destacada)} onChange={(event) => setField('destacada', event.target.checked)} disabled={saving} /><span className="form-check-label">Destacar esta nota en la parte superior</span></label>
                    </div>
                </section>

                <section className="agenda2-form-section">
                    <div className="agenda2-section-heading"><span><Link2 size={19} /></span><div><h3>Visitas relacionadas</h3><p>Una nota puede estar vinculada a varias citas sin perderse al editar.</p></div></div>
                    <label className="agenda2-search-field mt-5"><Search size={16} /><input type="search" value={visitQuery} onChange={(event) => setVisitQuery(event.target.value)} placeholder="Buscar visita o cliente, incluso en el historial" />{visitsLoading && <Loader2 size={16} className="animate-spin cjm-muted" />}</label>
                    <div className="agenda2-link-list mt-3">
                        {filteredVisitOptions.length ? filteredVisitOptions.slice(0, 30).map((visit) => {
                            const checked = linkedVisits.includes(Number(visit.id));
                            return (
                                <label key={visit.id} className={`agenda2-link-option ${checked ? 'agenda2-link-option-active' : ''}`}>
                                    <input type="checkbox" checked={checked} onChange={(event) => setLinkedVisits((current) => event.target.checked ? [...new Set([...current, Number(visit.id)])] : current.filter((id) => id !== Number(visit.id)))} disabled={saving} />
                                    <span className="min-w-0"><strong>{visit.titulo || visit.descripcion || 'Visita'}</strong><small>{visit.cliente_nombre || visit.cliente_id || 'Sin cliente'} · {formatDateTime(visit.fecha)}</small></span>
                                </label>
                            );
                        }) : <p className="text-sm cjm-muted">No hay visitas que coincidan con la búsqueda.</p>}
                    </div>
                </section>

                <section className="agenda2-form-section sm:col-span-2">
                    <div className="agenda2-section-heading"><span><FileImage size={19} /></span><div><h3>Imágenes</h3><p>Adjunta hasta tres fotografías o capturas.</p></div></div>
                    <div className="mt-5 flex flex-wrap gap-3">
                        {existingImages.map((image) => <figure key={image} className="agenda2-image-preview"><img src={image} alt={getImageName(image)} /><button type="button" onClick={() => setExistingImages((current) => current.filter((item) => item !== image))} aria-label="Quitar imagen">×</button></figure>)}
                        {newImagePreviews.map(({ file, url }, index) => <figure key={`${file.name}-${file.lastModified}-${index}`} className="agenda2-image-preview"><img src={url} alt={file.name} /><button type="button" onClick={() => setNewImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Quitar imagen">×</button></figure>)}
                        {existingImages.length + newImages.length < 3 && <label className="agenda2-image-add"><FileImage size={22} /><span>Añadir imagen</span><input type="file" accept="image/*" multiple onChange={handleImages} disabled={saving} /></label>}
                    </div>
                </section>
            </div>
            {error && <div className="agenda2-error mt-5" role="alert">{error}</div>}
        </AgendaDrawer>
    );
}
