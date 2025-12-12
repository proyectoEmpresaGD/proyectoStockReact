// src/components/notas/NotasPage.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format, parseISO, isValid, subDays } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import { Pencil, Trash2 } from 'lucide-react';
import { AiOutlineClose } from 'react-icons/ai';
import { useAuthContext } from '../../Auth/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Mini-componente de imagen con "skeleton" mientras carga.
 */
function ImagenConLoader({ src, alt, onClick }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className="relative h-20 w-20">
            {!loaded && <div className="absolute inset-0 animate-pulse rounded bg-gray-200" />}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onClick={onClick}
                className={`h-20 w-20 cursor-pointer rounded object-cover transition-opacity duration-300 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'
                    }`}
            />
        </div>
    );
}

/**
 * Página de Notas
 */
export default function NotasPage() {
    const { token } = useAuthContext();
    const navigate = useNavigate();

    // -------------------------------
    // ESTADO PRINCIPAL DE DATOS
    // -------------------------------
    const [notas, setNotas] = useState([]);
    const [events, setEvents] = useState([]);

    // Cargas/errores
    const [loadingNotas, setLoadingNotas] = useState(true);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [errorNotas, setErrorNotas] = useState(null);
    const [errorEvents, setErrorEvents] = useState(null);

    // Filtros (parche: estado unificado + updater)
    const [filters, setFilters] = useState({
        name: '',
        date: '',
        showUnlinked: true,
    });
    const filterName = filters.name;
    const filterDate = filters.date;
    const showUnlinked = filters.showUnlinked;

    const updateFilters = useCallback((next) => {
        setFilters((prev) => ({ ...prev, ...next }));
    }, []);

    // Crear/editar
    const [modalOpen, setModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [titulo, setTitulo] = useState('');
    const [contenido, setContenido] = useState('');
    const [files, setFiles] = useState([]); // nuevos archivos
    const [previews, setPreviews] = useState([]);
    const [linkedEventIds, setLinkedEventIds] = useState([]); // ids string
    const [existingImages, setExistingImages] = useState([]); // URLs existentes
    const [subiendo, setSubiendo] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Borrar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);

    // Vista previa
    const [vistaNota, setVistaNota] = useState(null);
    const modalRef = useRef(null);

    // Paginación + modo vista
    const [visibleNotas, setVisibleNotas] = useState(9);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    // -------------------------------
    // HELPERS
    // -------------------------------
    const safeFormat = (iso, fmt) => {
        try {
            const d = parseISO(iso || '');
            return isValid(d) ? format(d, fmt, { locale: es }) : 'Fecha desconocida';
        } catch {
            return 'Fecha desconocida';
        }
    };

    const ts = (n) => {
        const d = Date.parse(n.actualizado_en ?? n.creado_en ?? '');
        return Number.isNaN(d) ? 0 : d;
    };

    // -------------------------------
    // FETCH DE NOTAS
    // -------------------------------
    const fetchNotas = useCallback(
        async (signal) => {
            if (!token) return;
            setLoadingNotas(true);
            setErrorNotas(null);
            const params = new URLSearchParams({ limit: '100', offset: '0' });

            try {
                const response = await fetch(`${API_BASE_URL}/api/notas?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal,
                });
                if (response.status === 401) {
                    navigate('/login');
                    throw new Error('Sesión expirada, vuelve a iniciar.');
                }
                if (!response.ok) throw new Error('Error obteniendo notas');

                const data = await response.json();
                const norm = (Array.isArray(data) ? data : []).map((n) => ({
                    ...n,
                    eventos: Array.isArray(n.eventos) ? n.eventos : [],
                    imagenes: Array.isArray(n.imagenes) ? n.imagenes : [],
                    creado_en: typeof n.fechacreado === 'string' ? n.fechacreado : '',
                    actualizado_en: typeof n.fechaactualizado === 'string' ? n.fechaactualizado : null,
                }));
                norm.sort((a, b) => ts(b) - ts(a));
                setNotas(norm);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                    setErrorNotas(error.message || 'No se pudieron cargar las notas');
                }
            } finally {
                setLoadingNotas(false);
            }
        },
        [token, navigate]
    );

    useEffect(() => {
        const controller = new AbortController();
        fetchNotas(controller.signal);
        return () => controller.abort();
    }, [fetchNotas]);

    // -------------------------------
    // FETCH DE CALENDARIO (EVENTOS)
    // -------------------------------
    const fetchEventos = useCallback(
        async (signal) => {
            if (!token) return;
            setLoadingEvents(true);
            setErrorEvents(null);
            try {
                const response = await fetch(`${API_BASE_URL}/api/calendario`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal,
                });
                if (response.status === 401) {
                    navigate('/login');
                    throw new Error('Sesión expirada, vuelve a iniciar.');
                }
                if (!response.ok) throw new Error('Error obteniendo calendario');

                const data = await response.json();
                const registros = Array.isArray(data) ? data : data.registros || [];
                const evs = registros
                    .filter((evt) => typeof evt.fecha === 'string' && isValid(parseISO(evt.fecha)))
                    .map((evt) => {
                        const f = parseISO(evt.fecha);
                        return {
                            id: String(evt.id),
                            fecha: evt.fecha,
                            mes: format(f, 'MMMM yyyy', { locale: es }),
                            label: `${evt.descripcion} – ${format(f, "d 'de' MMMM yyyy", { locale: es })}`,
                        };
                    });
                setEvents(evs);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                    setErrorEvents(error.message || 'No se pudieron cargar las visitas vinculables');
                }
            } finally {
                setLoadingEvents(false);
            }
        },
        [token, navigate]
    );

    useEffect(() => {
        const controller = new AbortController();
        fetchEventos(controller.signal);
        return () => controller.abort();
    }, [fetchEventos]);

    // -------------------------------
    // PREVIEW DE IMÁGENES NUEVAS
    // -------------------------------
    useEffect(() => {
        const urls = files.map((f) => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [files]);

    // -------------------------------
    // MEMOS PARA FILTRADO Y SELECT
    // -------------------------------
    const userEventIds = useMemo(() => new Set(events.map((e) => String(e.id))), [events]);

    const selectOptions = useMemo(() => {
        const m = new Map();
        events.forEach((ev) => {
            const arr = m.get(ev.mes) || [];
            arr.push({ value: ev.id, label: ev.label });
            m.set(ev.mes, arr);
        });
        return Array.from(m, ([mes, opts]) => ({ label: mes, options: opts }));
    }, [events]);

    const eventsMap = useMemo(() => {
        const map = new Map();
        events.forEach((ev) => {
            map.set(String(ev.id), ev);
        });
        return map;
    }, [events]);

    const filteredNotas = useMemo(() => {
        const haveEvents = events.length > 0;

        return notas.filter((n) => {
            const passesEvent = haveEvents
                ? (showUnlinked && n.eventos.length === 0) || n.eventos.some((eid) => userEventIds.has(String(eid)))
                : true;

            const nameMatch = filterName ? n.titulo.toLowerCase().includes(filterName.toLowerCase()) : true;

            const dateMatch = filterDate
                ? n.eventos.some((eid) => {
                    const ev = eventsMap.get(String(eid));
                    return ev && format(parseISO(ev.fecha), 'yyyy-MM-dd') === filterDate;
                })
                : true;

            return passesEvent && nameMatch && dateMatch;
        });
    }, [notas, filterName, filterDate, events, userEventIds, showUnlinked, eventsMap]);

    const totalFiltered = filteredNotas.length;
    const paginatedNotas = filteredNotas.slice(0, visibleNotas);

    const linkedIdsSet = useMemo(() => new Set(linkedEventIds.map((id) => String(id))), [linkedEventIds]);

    const stats = useMemo(() => {
        const total = notas.length;
        const vinculadas = notas.filter((n) => n.eventos.length > 0).length;
        const sinVinculo = total - vinculadas;
        const limiteRecientes = subDays(new Date(), 7);
        const recientes = notas.filter((n) => {
            const referencia = n.actualizado_en || n.creado_en;
            if (!referencia) return false;
            const parsed = parseISO(referencia);
            return isValid(parsed) && parsed >= limiteRecientes;
        }).length;
        return { total, vinculadas, sinVinculo, recientes };
    }, [notas]);

    // -------------------------------
    // HANDLERS DE CRUD
    // -------------------------------
    const abrirCrear = () => {
        setIsEditing(false);
        setEditId(null);
        setTitulo('');
        setContenido('');
        setFiles([]);
        setPreviews([]);
        setLinkedEventIds([]);
        setExistingImages([]);
        setModalOpen(true);
    };

    const abrirEditar = (nota) => {
        setIsEditing(true);
        setEditId(nota.id);
        setTitulo(nota.titulo);
        setContenido(nota.contenido);
        setFiles([]);
        setPreviews([]);
        setLinkedEventIds(nota.eventos.map((e) => String(e)));
        setExistingImages(nota.imagenes);
        setModalOpen(true);
    };

    const confirmarBorrar = (nota) => {
        setToDelete(nota);
        setConfirmOpen(true);
    };

    const borrar = () => {
        if (!toDelete) return;
        fetch(`${API_BASE_URL}/api/notas/${toDelete.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (r.status === 401) {
                    navigate('/login');
                    throw new Error('Unauthorized');
                }
                if (!r.ok) throw new Error();
                setNotas((prev) => prev.filter((n) => n.id !== toDelete.id));
                setFeedback({ type: 'success', message: 'Nota eliminada correctamente.' });
            })
            .catch((error) => {
                console.error(error);
                setFeedback({ type: 'error', message: 'No se pudo eliminar la nota.' });
            })
            .finally(() => {
                setConfirmOpen(false);
                setToDelete(null);
            });
    };

    const guardar = async () => {
        if (subiendo) return;

        const tituloLimpio = titulo.trim();
        const contenidoLimpio = contenido.trim();
        const eventosUnicos = Array.from(
            new Set(linkedEventIds.map((id) => String(id).trim()).filter(Boolean))
        );

        if (!tituloLimpio || !contenidoLimpio) {
            setFeedback({ type: 'error', message: 'Título y contenido son obligatorios.' });
            return;
        }
        const totalImgs = existingImages.length + files.length;
        if (totalImgs > 3) {
            setFeedback({ type: 'error', message: 'Máximo 3 imágenes por nota.' });
            return;
        }

        setSubiendo(true);

        try {
            const form = new FormData();
            form.append('titulo', tituloLimpio);
            form.append('contenido', contenidoLimpio);
            eventosUnicos.forEach((id) => form.append('eventos[]', id));

            if (isEditing) {
                existingImages.forEach((url) => {
                    const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
                    form.append('keep_imagenes[]', filename);
                });
            }

            files.forEach((f) => form.append('imagenes', f));

            const url = isEditing ? `${API_BASE_URL}/api/notas/${editId}` : `${API_BASE_URL}/api/notas`;
            const response = await fetch(url, {
                method: isEditing ? 'PATCH' : 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });

            if (response.status === 401) {
                navigate('/login');
                throw new Error('Unauthorized');
            }

            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body?.error || 'Error guardando nota');
            }

            const newNota = body;
            const norm = {
                ...newNota,
                eventos: Array.isArray(newNota.eventos) ? newNota.eventos : [],
                imagenes: Array.isArray(newNota.imagenes) ? newNota.imagenes : [],
                creado_en: newNota.fechacreado || new Date().toISOString(),
                actualizado_en: newNota.fechaactualizado || null,
            };

            setNotas((prev) => {
                const arr = isEditing ? prev.map((n) => (n.id === editId ? norm : n)) : [norm, ...prev];
                return arr.sort((a, b) => ts(b) - ts(a));
            });

            setModalOpen(false);
            setFeedback({
                type: 'success',
                message: isEditing ? 'Cambios guardados correctamente.' : 'Nota creada con éxito.',
            });

            await fetchNotas();
        } catch (error) {
            console.error(error);
            setFeedback({ type: 'error', message: error.message || 'Error guardando nota.' });
        } finally {
            setSubiendo(false);
        }
    };

    // Vista previa
    const abrirVista = (nota) => setVistaNota(nota);
    const cerrarVista = () => setVistaNota(null);

    // Cerrar modales con ESC
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (modalOpen) setModalOpen(false);
                if (vistaNota) setVistaNota(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modalOpen, vistaNota]);

    // Retry & auto-hide feedback
    const retryNotas = () => fetchNotas();
    const retryEventos = () => fetchEventos();

    useEffect(() => {
        if (!feedback) return;
        const timeout = setTimeout(() => setFeedback(null), 5000);
        return () => clearTimeout(timeout);
    }, [feedback]);

    // -------------------------------
    // RENDER
    // -------------------------------
    return (
        <div className="relative min-h-screen bg-gray-50 px-3 py-6 sm:px-6 sm:py-10">
            {(loadingNotas || loadingEvents) && (
                <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                    Sincronizando notas y visitas relacionadas...
                </div>
            )}
            {(errorNotas || errorEvents) && (
                <div className="mb-4 space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p>Ocurrió un problema al actualizar los datos.</p>
                    <div className="flex flex-wrap gap-2">
                        {errorNotas && (
                            <button
                                onClick={retryNotas}
                                className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                            >
                                Reintentar notas
                            </button>
                        )}
                        {errorEvents && (
                            <button
                                onClick={retryEventos}
                                className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                            >
                                Reintentar visitas
                            </button>
                        )}
                    </div>
                </div>
            )}
            {feedback && (
                <div
                    className={`mb-4 rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                >
                    {feedback.message}
                </div>
            )}

            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">📝 Mis Notas</h1>
                    <p className="text-sm text-gray-500">
                        Centraliza acuerdos, ideas y pendientes de cada cliente en un solo lugar.
                    </p>
                </div>
                <div className="w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:w-auto">
                    <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-100 p-1 sm:w-auto">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${viewMode === 'grid'
                                ? 'bg-white text-indigo-600 shadow'
                                : 'text-gray-600 hover:text-indigo-600'
                                }`}
                        >
                            🗂️ Tarjetas
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${viewMode === 'list'
                                ? 'bg-white text-indigo-600 shadow'
                                : 'text-gray-600 hover:text-indigo-600'
                                }`}
                        >
                            📋 Lista
                        </button>
                    </div>
                    <button
                        onClick={abrirCrear}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-center text-white shadow transition hover:bg-indigo-700 sm:mt-0 sm:w-auto"
                    >
                        <span>➕</span>
                        Nueva nota
                    </button>
                </div>
            </div>

            {/* Stats */}
            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    {
                        label: 'Notas totales',
                        value: stats.total,
                        helper: 'Todo tu conocimiento centralizado',
                        accent: 'bg-indigo-100 text-indigo-600',
                    },
                    {
                        label: 'Con visita vinculada',
                        value: stats.vinculadas,
                        helper: 'Notas conectadas con la agenda',
                        accent: 'bg-emerald-100 text-emerald-600',
                    },
                    {
                        label: 'Sin visita',
                        value: stats.sinVinculo,
                        helper: 'Ideas o seguimientos libres',
                        accent: 'bg-orange-100 text-orange-600',
                    },
                    {
                        label: 'Actualizadas últimos 7 días',
                        value: stats.recientes,
                        helper: 'Manténlas vivas y relevantes',
                        accent: 'bg-purple-100 text-purple-600',
                    },
                ].map((card) => (
                    <article
                        key={card.label}
                        className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow"
                    >
                        <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide ${card.accent}`}
                        >
                            {card.label}
                        </span>
                        <p className="mt-3 text-3xl font-semibold text-gray-900">{card.value}</p>
                        <p className="mt-1 text-sm text-gray-500">{card.helper}</p>
                    </article>
                ))}
            </section>

            {/* Filtros */}
            <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow">
                    <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Título</p>
                    <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
                        <span role="img" aria-hidden="true">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar por título"
                            className="flex-1 bg-transparent text-sm outline-none"
                            value={filterName}
                            onChange={(e) => updateFilters({ name: e.target.value })}
                        />
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow">
                    <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Fecha de la visita</p>
                    <input
                        type="date"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={filterDate}
                        onChange={(e) => updateFilters({ date: e.target.value })}
                    />
                </div>
                <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Visibilidad</p>
                    <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                        <span>Incluir notas sin cita</span>
                        <input
                            type="checkbox"
                            checked={showUnlinked}
                            onChange={(e) => updateFilters({ showUnlinked: e.target.checked })}
                            className="h-5 w-5"
                        />
                    </label>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow">
                    <p className="mb-2 text-xs font-semibold uppercase text-indigo-700">Acción rápida</p>
                    <p className="mb-3 text-sm text-indigo-900">
                        Restablece los filtros para volver a ver todas tus notas.
                    </p>
                    <button
                        className="text-sm font-semibold text-indigo-700 underline"
                        onClick={() => {
                            setFilters({ name: '', date: '', showUnlinked: true });
                        }}
                    >
                        Limpiar filtros
                    </button>
                </div>
            </section>

            {/* Contenido */}
            {loadingNotas || loadingEvents ? (
                <div className="animate-pulse py-20 text-center text-gray-400">Cargando…</div>
            ) : totalFiltered === 0 ? (
                <div className="py-20 text-center text-gray-500">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa "Nueva nota" para crear la primera.'
                        : 'No hay notas que coincidan con los filtros aplicados.'}
                </div>
            ) : viewMode === 'grid' ? (
                <>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {paginatedNotas.map((n) => (
                            <article
                                key={n.id}
                                className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow transition hover:shadow-xl"
                                onClick={() => abrirVista(n)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-gray-400">
                                            Creada el {safeFormat(n.creado_en, "d 'de' MMMM yyyy")}
                                        </p>
                                        {n.actualizado_en && (
                                            <p className="text-[11px] text-gray-400">
                                                Actualizada {safeFormat(n.actualizado_en, "d 'de' MMM HH:mm")}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${n.eventos.length > 0
                                            ? 'bg-emerald-100 text-emerald-600'
                                            : 'bg-amber-100 text-amber-600'
                                            }`}
                                    >
                                        {n.eventos.length > 0
                                            ? `${n.eventos.length} ${n.eventos.length === 1 ? 'cita' : 'citas'}`
                                            : 'Sin visita'}
                                    </span>
                                </div>

                                <h2 className="line-clamp-2 text-xl font-semibold leading-snug text-gray-900">
                                    {n.titulo}
                                </h2>
                                <p className="line-clamp-4 text-sm leading-relaxed text-gray-600">
                                    {n.contenido}
                                </p>

                                {n.eventos.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {n.eventos.slice(0, 3).map((eid) => {
                                            const ev = eventsMap.get(String(eid));
                                            const label = ev ? ev.label : `Evento ${eid}`;
                                            return (
                                                <span
                                                    key={eid}
                                                    className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] text-indigo-700"
                                                >
                                                    {label}
                                                </span>
                                            );
                                        })}
                                        {n.eventos.length > 3 && (
                                            <span className="text-[11px] text-gray-500">
                                                +{n.eventos.length - 3} más
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="w-max rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-600">
                                        Sin visita asociada
                                    </span>
                                )}

                                {n.imagenes.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {n.imagenes.slice(0, 3).map((url, i) => (
                                            <img
                                                key={i}
                                                src={url}
                                                alt=""
                                                className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                                            />
                                        ))}
                                    </div>
                                )}

                                <div className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-3">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            abrirEditar(n);
                                        }}
                                        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Pencil size={16} /> Editar
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            confirmarBorrar(n);
                                        }}
                                        className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
                                    >
                                        <Trash2 size={16} /> Eliminar
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>

                    {totalFiltered > visibleNotas && (
                        <div className="mt-8 text-center">
                            <button
                                onClick={() => setVisibleNotas((v) => v + 6)}
                                className="rounded-full bg-indigo-600 px-5 py-2 text-white shadow transition hover:bg-indigo-700"
                            >
                                Ver más notas
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="rounded-2xl border border-gray-100 bg-white shadow">
                        <div className="w-full overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Nota
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Visitas vinculadas
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Última actualización
                                        </th>
                                        <th className="px-6 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {paginatedNotas.map((n) => (
                                        <tr
                                            key={n.id}
                                            className="cursor-pointer hover:bg-indigo-50"
                                            onClick={() => abrirVista(n)}
                                        >
                                            <td className="whitespace-normal px-6 py-4">
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {n.titulo}
                                                </p>
                                                <p className="max-w-xl line-clamp-2 text-sm text-gray-500">
                                                    {n.contenido}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                {n.eventos.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {n.eventos.slice(0, 2).map((eid) => {
                                                            const ev = eventsMap.get(String(eid));
                                                            const label = ev ? ev.label : `Evento ${eid}`;
                                                            return (
                                                                <span
                                                                    key={eid}
                                                                    className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] text-indigo-700"
                                                                >
                                                                    {label}
                                                                </span>
                                                            );
                                                        })}
                                                        {n.eventos.length > 2 && (
                                                            <span className="text-[11px] text-gray-500">
                                                                +{n.eventos.length - 2} más
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-600">
                                                        Sin visita
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {safeFormat(
                                                    n.actualizado_en || n.creado_en,
                                                    "d 'de' MMM yyyy HH:mm"
                                                )}
                                            </td>
                                            <td className="space-x-2 px-6 py-4 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        abrirEditar(n);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                                                >
                                                    <Pencil size={16} /> Editar
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        confirmarBorrar(n);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
                                                >
                                                    <Trash2 size={16} /> Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {totalFiltered > visibleNotas && (
                        <div className="mt-8 text-center">
                            <button
                                onClick={() => setVisibleNotas((v) => v + 10)}
                                className="rounded-full bg-indigo-600 px-5 py-2 text-white shadow transition hover:bg-indigo-700"
                            >
                                Ver más resultados
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Confirmar borrar */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-black/50 px-3 py-4 sm:items-center sm:px-4 sm:py-6">
                    <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl">
                        <p className="mb-4">¿Eliminar esta nota?</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2">
                                Cancelar
                            </button>
                            <button onClick={borrar} className="rounded bg-red-500 px-4 py-2 text-white">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vista previa de una nota */}
            {vistaNota && (
                <div
                    className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-black/50 px-3 py-4 sm:items-center sm:px-6 sm:py-6"
                    onClick={cerrarVista}
                >
                    <div
                        ref={modalRef}
                        className="w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-2xl font-semibold text-gray-800">{vistaNota.titulo}</h2>
                            <button
                                onClick={cerrarVista}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <AiOutlineClose size={24} />
                            </button>
                        </header>

                        <main className="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:px-6 sm:py-5">
                            <div className="space-y-6">
                                <section className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                                    {vistaNota.contenido}
                                </section>

                                {vistaNota.imagenes.length > 0 && (
                                    <section>
                                        <h3 className="mb-2 text-lg font-medium text-gray-800">
                                            Imágenes
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                            {vistaNota.imagenes.map((url, i) => (
                                                <ImagenConLoader
                                                    key={i}
                                                    src={url}
                                                    alt={`img-${i}`}
                                                    onClick={() => window.open(url, '_blank')}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {vistaNota.eventos.length > 0 && (
                                    <section>
                                        <h3 className="mb-2 text-lg font-medium text-gray-800">
                                            Citas relacionadas
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {vistaNota.eventos.map((eid) => {
                                                const ev = eventsMap.get(String(eid));
                                                if (!ev) return null;
                                                return (
                                                    <span
                                                        key={eid}
                                                        className="cursor-pointer rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800 hover:bg-indigo-200"
                                                        onClick={() => {
                                                            cerrarVista();
                                                            navigate(`/agenda?eventId=${ev.id}`);
                                                        }}
                                                    >
                                                        {ev.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </main>

                        <footer className="border-t border-gray-200 px-5 py-3 text-right text-sm text-gray-500 sm:px-6">
                            Creado el{' '}
                            {safeFormat(
                                vistaNota.creado_en,
                                "d 'de' MMMM yyyy, HH:mm:ss"
                            )}
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal crear/editar */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-black/50 px-3 py-4 sm:items-center sm:px-6 sm:py-6"
                    onClick={() => setModalOpen(false)}
                >
                    <div
                        className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6 sm:max-h-[92vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="mb-4 text-xl font-bold">
                            {isEditing ? 'Editar nota' : 'Crear nota'}
                        </h2>

                        {/* Título */}
                        <input
                            type="text"
                            placeholder="Título"
                            className="mb-4 w-full rounded border px-3 py-2"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            disabled={subiendo}
                        />

                        {/* Contenido */}
                        <textarea
                            placeholder="Contenido"
                            className="mb-4 h-24 w-full rounded border px-3 py-2"
                            value={contenido}
                            onChange={(e) => setContenido(e.target.value)}
                            disabled={subiendo}
                        />

                        {/* Select citas relacionadas */}
                        <div className="mb-4">
                            <label className="mb-1 block font-medium">Citas relacionadas</label>
                            <Select
                                isMulti
                                options={selectOptions}
                                value={events
                                    .filter((ev) => linkedIdsSet.has(String(ev.id)))
                                    .map((ev) => ({
                                        value: ev.id,
                                        label: ev.label,
                                    }))}
                                onChange={(sel) =>
                                    setLinkedEventIds(sel.map((o) => String(o.value)))
                                }
                                classNamePrefix="react-select"
                                placeholder="Busca por mes…"
                                isDisabled={subiendo}
                            />
                        </div>

                        {/* Imágenes */}
                        <div className="mb-4">
                            <label className="mb-1 block font-medium">
                                Imágenes (max 3)
                            </label>
                            <div className="mb-2 flex gap-2">
                                {/* Cámara (móvil) */}
                                <label className="flex cursor-pointer items-center gap-2 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                                    📷
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => {
                                            const arr = Array.from(
                                                e.target.files || []
                                            ).filter((f) => /^image\//.test(f.type));
                                            if (
                                                existingImages.length +
                                                files.length +
                                                arr.length >
                                                3
                                            ) {
                                                setFeedback({
                                                    type: 'error',
                                                    message:
                                                        'Máximo 3 imágenes por nota.',
                                                });
                                                return;
                                            }
                                            setFiles((prev) => [
                                                ...prev,
                                                ...arr,
                                            ]);
                                        }}
                                        disabled={subiendo}
                                    />
                                </label>

                                {/* Galería */}
                                <label className="flex cursor-pointer items-center gap-2 rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">
                                    🖼️
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const arr = Array.from(
                                                e.target.files || []
                                            ).filter((f) => /^image\//.test(f.type));
                                            if (
                                                existingImages.length +
                                                files.length +
                                                arr.length >
                                                3
                                            ) {
                                                setFeedback({
                                                    type: 'error',
                                                    message:
                                                        'Máximo 3 imágenes por nota.',
                                                });
                                                return;
                                            }
                                            setFiles((prev) => [
                                                ...prev,
                                                ...arr,
                                            ]);
                                        }}
                                        disabled={subiendo}
                                    />
                                </label>
                            </div>

                            {/* Previews nuevas */}
                            {previews.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {previews.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img
                                                src={url}
                                                className="h-16 w-16 rounded object-cover"
                                                alt=""
                                            />
                                            <button
                                                onClick={() => {
                                                    setPreviews((p) =>
                                                        p.filter(
                                                            (_, idx) => idx !== i
                                                        )
                                                    );
                                                    setFiles((f) =>
                                                        f.filter(
                                                            (_, idx) => idx !== i
                                                        )
                                                    );
                                                }}
                                                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                                                disabled={subiendo}
                                                title="Quitar"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Imágenes existentes */}
                            {existingImages.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {existingImages.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img
                                                src={url}
                                                className="h-16 w-16 rounded object-cover"
                                                alt=""
                                            />
                                            <button
                                                onClick={() => {
                                                    setExistingImages((e) =>
                                                        e.filter((u) => u !== url)
                                                    );
                                                }}
                                                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                                                disabled={subiendo}
                                                title="Quitar"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Botones acción */}
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="rounded bg-gray-300 px-4 py-2"
                                disabled={subiendo}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardar}
                                className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                                disabled={subiendo}
                            >
                                {isEditing ? 'Actualizar' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
