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
        <div className="relative w-20 h-20">
            {!loaded && <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onClick={onClick}
                className={`w-20 h-20 object-cover rounded cursor-pointer transition-opacity duration-300 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'
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

    // Filtros
    const [filterName, setFilterName] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [showUnlinked, setShowUnlinked] = useState(true);

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
                    signal
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
                    actualizado_en: typeof n.fechaactualizado === 'string' ? n.fechaactualizado : null
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
                    signal
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
                            label: `${evt.descripcion} – ${format(f, "d 'de' MMMM yyyy", { locale: es })}`
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
                ? (showUnlinked && n.eventos.length === 0) ||
                n.eventos.some((eid) => userEventIds.has(String(eid)))
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

    const linkedIdsSet = useMemo(
        () => new Set(linkedEventIds.map((id) => String(id))),
        [linkedEventIds]
    );

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
            headers: { Authorization: `Bearer ${token}` }
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

    const guardar = () => {
        if (!titulo.trim() || !contenido.trim()) {
            setFeedback({ type: 'error', message: 'Título y contenido son obligatorios.' });
            return;
        }
        const totalImgs = existingImages.length + files.length;
        if (totalImgs > 3) {
            setFeedback({ type: 'error', message: 'Máximo 3 imágenes por nota.' });
            return;
        }

        setSubiendo(true);

        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        linkedEventIds.forEach((id) => form.append('eventos[]', String(id)));

        if (isEditing) {
            existingImages.forEach((url) => {
                const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
                form.append('keep_imagenes[]', filename);
            });
        }

        files.forEach((f) => form.append('imagenes', f));

        const url = isEditing ? `${API_BASE_URL}/api/notas/${editId}` : `${API_BASE_URL}/api/notas`;
        fetch(url, {
            method: isEditing ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
        })
            .then(async (r) => {
                if (r.status === 401) {
                    navigate('/login');
                    throw new Error('Unauthorized');
                }
                if (!r.ok) {
                    const errBody = await r.json().catch(() => ({}));
                    throw new Error(errBody?.error || 'Error guardando nota');
                }
                return r.json();
            })
            .then((newNota) => {
                const norm = {
                    ...newNota,
                    eventos: Array.isArray(newNota.eventos) ? newNota.eventos : [],
                    imagenes: Array.isArray(newNota.imagenes) ? newNota.imagenes : [],
                    creado_en: newNota.fechacreado || new Date().toISOString(),
                    actualizado_en: newNota.fechaactualizado || null
                };
                setNotas((prev) => {
                    const arr = isEditing ? prev.map((n) => (n.id === editId ? norm : n)) : [norm, ...prev];
                    return arr.sort((a, b) => ts(b) - ts(a));
                });
                setModalOpen(false);
                setFeedback({
                    type: 'success',
                    message: isEditing ? 'Cambios guardados correctamente.' : 'Nota creada con éxito.'
                });
            })
            .catch((e) => {
                console.error(e);
                setFeedback({ type: 'error', message: e.message || 'Error guardando nota.' });
            })
            .finally(() => setSubiendo(false));
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
        <div className="relative min-h-screen px-6 py-10 bg-gray-50">
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
                            <button onClick={retryNotas} className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700">
                                Reintentar notas
                            </button>
                        )}
                        {errorEvents && (
                            <button onClick={retryEventos} className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700">
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
            <div className="bg-white rounded-2xl shadow px-6 py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">📝 Mis Notas</h1>
                    <p className="text-sm text-gray-500">
                        Centraliza acuerdos, ideas y pendientes de cada cliente en un solo lugar.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-end">
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-indigo-600'
                                }`}
                        >
                            🗂️ Tarjetas
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-indigo-600'
                                }`}
                        >
                            📋 Lista
                        </button>
                    </div>
                    <button
                        onClick={abrirCrear}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow"
                    >
                        <span>➕</span>
                        Nueva nota
                    </button>
                </div>
            </div>

            {/* Stats */}
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
                {[
                    {
                        label: 'Notas totales',
                        value: stats.total,
                        helper: 'Todo tu conocimiento centralizado',
                        accent: 'bg-indigo-100 text-indigo-600'
                    },
                    {
                        label: 'Con visita vinculada',
                        value: stats.vinculadas,
                        helper: 'Notas conectadas con la agenda',
                        accent: 'bg-emerald-100 text-emerald-600'
                    },
                    {
                        label: 'Sin visita',
                        value: stats.sinVinculo,
                        helper: 'Ideas o seguimientos libres',
                        accent: 'bg-orange-100 text-orange-600'
                    },
                    {
                        label: 'Actualizadas últimos 7 días',
                        value: stats.recientes,
                        helper: 'Manténlas vivas y relevantes',
                        accent: 'bg-purple-100 text-purple-600'
                    }
                ].map((card) => (
                    <article key={card.label} className="bg-white rounded-2xl shadow px-5 py-4 border border-gray-100">
                        <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${card.accent}`}>
                            {card.label}
                        </span>
                        <p className="mt-3 text-3xl font-semibold text-gray-900">{card.value}</p>
                        <p className="mt-1 text-sm text-gray-500">{card.helper}</p>
                    </article>
                ))}
            </section>

            {/* Filtros */}
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
                <div className="bg-white rounded-xl shadow px-4 py-3 border border-gray-100">
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Título</p>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                        <span role="img" aria-hidden="true">🔍</span>
                        <input
                            type="text"
                            placeholder="Buscar por título"
                            className="bg-transparent flex-1 outline-none text-sm"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow px-4 py-3 border border-gray-100">
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Fecha de la visita</p>
                    <input
                        type="date"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    />
                </div>
                <div className="bg-white rounded-xl shadow px-4 py-3 border border-gray-100 flex flex-col justify-between">
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Visibilidad</p>
                    <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                        <span>Incluir notas sin cita</span>
                        <input
                            type="checkbox"
                            checked={showUnlinked}
                            onChange={(e) => setShowUnlinked(e.target.checked)}
                            className="h-5 w-5"
                        />
                    </label>
                </div>
                <div className="rounded-xl shadow px-4 py-3 border border-indigo-200 bg-indigo-50">
                    <p className="text-xs font-semibold uppercase text-indigo-700 mb-2">Acción rápida</p>
                    <p className="text-sm text-indigo-900 mb-3">Restablece los filtros para volver a ver todas tus notas.</p>
                    <button
                        className="text-sm font-semibold text-indigo-700 underline"
                        onClick={() => {
                            setFilterName('');
                            setFilterDate('');
                            setShowUnlinked(true);
                        }}
                    >
                        Limpiar filtros
                    </button>
                </div>
            </section>

            {/* Contenido */}
            {loadingNotas || loadingEvents ? (
                <div className="text-center py-20 text-gray-400 animate-pulse">Cargando…</div>
            ) : totalFiltered === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa "Nueva nota" para crear la primera.'
                        : 'No hay notas que coincidan con los filtros aplicados.'}
                </div>
            ) : viewMode === 'grid' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {paginatedNotas.map((n) => (
                            <article
                                key={n.id}
                                className="bg-white p-5 rounded-2xl shadow hover:shadow-xl transition cursor-pointer flex flex-col gap-3 border border-gray-100"
                                onClick={() => abrirVista(n)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-gray-400">Creada el {safeFormat(n.creado_en, "d 'de' MMMM yyyy")}</p>
                                        {n.actualizado_en && (
                                            <p className="text-[11px] text-gray-400">
                                                Actualizada {safeFormat(n.actualizado_en, "d 'de' MMM HH:mm")}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`text-[11px] font-semibold px-2 py-1 rounded-full ${n.eventos.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                                            }`}
                                    >
                                        {n.eventos.length > 0
                                            ? `${n.eventos.length} ${n.eventos.length === 1 ? 'cita' : 'citas'}`
                                            : 'Sin visita'}
                                    </span>
                                </div>

                                <h2 className="font-semibold text-xl text-gray-900 leading-snug line-clamp-2">{n.titulo}</h2>
                                <p className="text-gray-600 text-sm leading-relaxed line-clamp-4">{n.contenido}</p>

                                {n.eventos.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {n.eventos.slice(0, 3).map((eid) => {
                                            const ev = eventsMap.get(String(eid));
                                            const label = ev ? ev.label : `Evento ${eid}`;
                                            return (
                                                <span key={eid} className="text-[11px] bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                                                    {label}
                                                </span>
                                            );
                                        })}
                                        {n.eventos.length > 3 && (
                                            <span className="text-[11px] text-gray-500">+{n.eventos.length - 3} más</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full w-max">
                                        Sin visita asociada
                                    </span>
                                )}

                                {n.imagenes.length > 0 && (
                                    <div className="flex gap-2">
                                        {n.imagenes.slice(0, 3).map((url, i) => (
                                            <img
                                                key={i}
                                                src={url}
                                                alt=""
                                                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                            />
                                        ))}
                                    </div>
                                )}

                                <div className="mt-auto flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
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
                        <div className="text-center mt-8">
                            <button
                                onClick={() => setVisibleNotas((v) => v + 6)}
                                className="bg-indigo-600 text-white px-5 py-2 rounded-full shadow hover:bg-indigo-700 transition"
                            >
                                Ver más notas
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Nota
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Visitas vinculadas
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Última actualización
                                    </th>
                                    <th className="px-6 py-3" />
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedNotas.map((n) => (
                                    <tr key={n.id} className="hover:bg-indigo-50 cursor-pointer" onClick={() => abrirVista(n)}>
                                        <td className="px-6 py-4 whitespace-normal">
                                            <p className="text-sm font-semibold text-gray-900">{n.titulo}</p>
                                            <p className="text-sm text-gray-500 line-clamp-2 max-w-xl">{n.contenido}</p>
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
                                                                className="text-[11px] bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full"
                                                            >
                                                                {label}
                                                            </span>
                                                        );
                                                    })}
                                                    {n.eventos.length > 2 && (
                                                        <span className="text-[11px] text-gray-500">+{n.eventos.length - 2} más</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Sin visita</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {safeFormat(n.actualizado_en || n.creado_en, "d 'de' MMM yyyy HH:mm")}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
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

                    {totalFiltered > visibleNotas && (
                        <div className="text-center mt-8">
                            <button
                                onClick={() => setVisibleNotas((v) => v + 10)}
                                className="bg-indigo-600 text-white px-5 py-2 rounded-full shadow hover:bg-indigo-700 transition"
                            >
                                Ver más resultados
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Confirmar borrar */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <p className="mb-4">¿Eliminar esta nota?</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2">
                                Cancelar
                            </button>
                            <button onClick={borrar} className="px-4 py-2 bg-red-500 text-white rounded">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vista previa de una nota */}
            {vistaNota && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={cerrarVista}>
                    <div
                        ref={modalRef}
                        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="text-2xl font-semibold text-gray-800">{vistaNota.titulo}</h2>
                            <button onClick={cerrarVista} className="text-gray-500 hover:text-gray-700">
                                <AiOutlineClose size={24} />
                            </button>
                        </header>

                        <main className="px-6 py-4 space-y-6">
                            <section className="text-gray-700 leading-relaxed whitespace-pre-wrap">{vistaNota.contenido}</section>

                            {vistaNota.imagenes.length > 0 && (
                                <section>
                                    <h3 className="text-lg font-medium mb-2 text-gray-800">Imágenes</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {vistaNota.imagenes.map((url, i) => (
                                            <ImagenConLoader key={i} src={url} alt={`img-${i}`} onClick={() => window.open(url, '_blank')} />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {vistaNota.eventos.length > 0 && (
                                <section>
                                    <h3 className="text-lg font-medium mb-2 text-gray-800">Citas relacionadas</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {vistaNota.eventos.map((eid) => {
                                            const ev = eventsMap.get(String(eid));
                                            if (!ev) return null;
                                            return (
                                                <span
                                                    key={eid}
                                                    className="text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full cursor-pointer hover:bg-indigo-200"
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
                        </main>

                        <footer className="px-6 py-3 border-t border-gray-200 text-right text-gray-500 text-sm">
                            Creado el {safeFormat(vistaNota.creado_en, "d 'de' MMMM yyyy, HH:mm:ss")}
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal crear/editar */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl overflow-y-auto max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Editar nota' : 'Crear nota'}</h2>

                        {/* Título */}
                        <input
                            type="text"
                            placeholder="Título"
                            className="w-full border px-3 py-2 rounded mb-4"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            disabled={subiendo}
                        />

                        {/* Contenido */}
                        <textarea
                            placeholder="Contenido"
                            className="w-full border px-3 py-2 rounded h-24 mb-4"
                            value={contenido}
                            onChange={(e) => setContenido(e.target.value)}
                            disabled={subiendo}
                        />

                        {/* Select citas relacionadas */}
                        <div className="mb-4">
                            <label className="block mb-1 font-medium">Citas relacionadas</label>
                            <Select
                                isMulti
                                options={selectOptions}
                                value={events
                                    .filter((ev) => linkedIdsSet.has(String(ev.id)))
                                    .map((ev) => ({ value: ev.id, label: ev.label }))}
                                onChange={(sel) => setLinkedEventIds(sel.map((o) => String(o.value)))}
                                classNamePrefix="react-select"
                                placeholder="Busca por mes…"
                                isDisabled={subiendo}
                            />
                        </div>

                        {/* Imágenes */}
                        <div className="mb-4">
                            <label className="block mb-1 font-medium">Imágenes (max 3)</label>
                            <div className="flex gap-2 mb-2">
                                {/* Cámara (móvil) */}
                                <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded cursor-pointer">
                                    📷
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => {
                                            const arr = Array.from(e.target.files || []).filter((f) => /^image\//.test(f.type));
                                            if (existingImages.length + files.length + arr.length > 3) {
                                                setFeedback({ type: 'error', message: 'Máximo 3 imágenes por nota.' });
                                                return;
                                            }
                                            setFiles((prev) => [...prev, ...arr]);
                                        }}
                                        disabled={subiendo}
                                    />
                                </label>

                                {/* Galería */}
                                <label className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded cursor-pointer">
                                    🖼️
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const arr = Array.from(e.target.files || []).filter((f) => /^image\//.test(f.type));
                                            if (existingImages.length + files.length + arr.length > 3) {
                                                setFeedback({ type: 'error', message: 'Máximo 3 imágenes por nota.' });
                                                return;
                                            }
                                            setFiles((prev) => [...prev, ...arr]);
                                        }}
                                        disabled={subiendo}
                                    />
                                </label>
                            </div>

                            {/* Previews nuevas */}
                            {previews.length > 0 && (
                                <div className="flex gap-2 mb-2">
                                    {previews.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img src={url} className="w-16 h-16 rounded object-cover" alt="" />
                                            <button
                                                onClick={() => {
                                                    setPreviews((p) => p.filter((_, idx) => idx !== i));
                                                    setFiles((f) => f.filter((_, idx) => idx !== i));
                                                }}
                                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
                                <div className="flex gap-2 mb-2">
                                    {existingImages.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img src={url} className="w-16 h-16 rounded object-cover" alt="" />
                                            <button
                                                onClick={() => {
                                                    setExistingImages((e) => e.filter((u) => u !== url));
                                                }}
                                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded" disabled={subiendo}>
                                Cancelar
                            </button>
                            <button
                                onClick={guardar}
                                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
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
