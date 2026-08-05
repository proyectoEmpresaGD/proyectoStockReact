import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText, Filter, Image as ImageIcon, Link2, Plus, Search, Star, UserRound } from 'lucide-react';
import { agendaClient } from '../../services/agendaClient';
import { EmptyAgenda, LoadingPanel, PriorityBadge, StatusBadge } from './AgendaUI';
import { formatDateTime, NOTE_TYPES } from './agendaUtils';

const PAGE_SIZE = 24;

export default function AgendaNotesView({ token, refreshKey, onNote, onNewNote }) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [type, setType] = useState('');
    const [priority, setPriority] = useState('');
    const [state, setState] = useState('');
    const [featured, setFeatured] = useState(false);
    const [followUp, setFollowUp] = useState(false);

    useEffect(() => { setPage(1); }, [query, type, priority, state, featured, followUp]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setLoading(true); setError('');
            agendaClient.listNotes(token, {
                q: query,
                type,
                priority,
                state,
                featured: featured ? true : '',
                follow_up: followUp ? true : '',
                limit: PAGE_SIZE,
                offset: (page - 1) * PAGE_SIZE,
            }, controller.signal).then((response) => {
                setItems(response?.items || []);
                setTotal(response?.total || 0);
            }).catch((requestError) => {
                if (requestError.name !== 'AbortError') setError(requestError.message);
            }).finally(() => setLoading(false));
        }, query ? 280 : 0);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [featured, followUp, page, priority, query, refreshKey, state, token, type]);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const typeMap = useMemo(() => Object.fromEntries(NOTE_TYPES.map((item) => [item.value, item.label])), []);

    return (
        <div className="grid gap-5">
            <section className="agenda2-filter-bar agenda2-notes-filter">
                <label className="agenda2-search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en títulos, contenido o clientes" /></label>
                <label><Filter size={16} /><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos los tipos</option>{NOTE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Cualquier prioridad</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
                <label><select value={state} onChange={(event) => setState(event.target.value)}><option value="">Todos los estados</option><option value="activa">Activa</option><option value="pendiente">Pendiente</option><option value="completada">Completada</option><option value="archivada">Archivada</option></select></label>
                <label className="agenda2-filter-check"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /><Star size={15} /> Destacadas</label>
                <label className="agenda2-filter-check"><input type="checkbox" checked={followUp} onChange={(event) => setFollowUp(event.target.checked)} /><CalendarClock size={15} /> Con seguimiento</label>
                <button type="button" onClick={onNewNote} className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold"><Plus size={18} /> Nueva nota</button>
            </section>

            {error && <div className="agenda2-error">{error}</div>}
            {loading ? <LoadingPanel label="Cargando notas…" /> : items.length ? (
                <>
                    <section className="agenda2-notes-grid">
                        {items.map((note) => (
                            <button type="button" key={note.id} className={`agenda2-note-card ${note.destacada ? 'agenda2-note-featured' : ''}`} onClick={() => onNote?.(note)}>
                                <div className="flex items-start justify-between gap-3">
                                    <span className="agenda2-note-icon"><FileText size={19} /></span>
                                    {note.destacada && <Star size={17} fill="currentColor" className="agenda2-star" />}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={note.estado} kind="note" /><PriorityBadge priority={note.prioridad} /><span className="agenda2-badge">{typeMap[note.tipo] || note.tipo}</span></div>
                                <h3>{note.titulo}</h3>
                                <p>{note.contenido}</p>
                                <div className="agenda2-note-meta">
                                    {note.cliente_nombre && <span><UserRound size={13} /> {note.cliente_nombre}</span>}
                                    {note.fecha_seguimiento && <span><CalendarClock size={13} /> {formatDateTime(note.fecha_seguimiento)}</span>}
                                    {note.eventos?.length > 0 && <span><Link2 size={13} /> {note.eventos.length} visita{note.eventos.length > 1 ? 's' : ''}</span>}
                                    {note.imagenes?.length > 0 && <span><ImageIcon size={13} /> {note.imagenes.length} imagen{note.imagenes.length > 1 ? 'es' : ''}</span>}
                                </div>
                                <small>Actualizada {formatDateTime(note.fechaactualizado || note.fechacreado)}</small>
                            </button>
                        ))}
                    </section>
                    <div className="agenda2-pagination">
                        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
                        <span>Página {page} de {pages} · {total} notas</span>
                        <button type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
                    </div>
                </>
            ) : <EmptyAgenda icon={FileText} title="No hay notas con estos filtros" description="Crea una nota para registrar acuerdos, llamadas, incidencias o próximas acciones." action={<button type="button" onClick={onNewNote} className="cjm-primary-button min-h-11 rounded-xl px-4 font-semibold">Crear nota</button>} />}
        </div>
    );
}
