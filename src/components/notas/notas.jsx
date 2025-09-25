// src/components/notas/NotasPage.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import { Pencil, Trash2 } from 'lucide-react';
import { AiOutlineClose } from 'react-icons/ai';
import { useAuthContext } from '../../Auth/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Mini-componente de imagen con "skeleton" mientras carga (mejora visual).
 * Mantiene su propio estado interno para controlar el fade-in.
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
 * Página de Notas:
 * - Lista, filtrado y paginación simple
 * - Crear/editar/borrar notas con imágenes (máx 3)
 * - Enlace opcional a eventos de calendario
 */
export default function NotasPage() {
    const { token } = useAuthContext();
    const navigate = useNavigate();

    // -------------------------------
    // ESTADO PRINCIPAL DE DATOS
    // -------------------------------
    const [notas, setNotas] = useState([]);
    const [events, setEvents] = useState([]);

    // Cargas independientes para evitar "pantallazos en blanco"
    const [loadingNotas, setLoadingNotas] = useState(true);
    const [loadingEvents, setLoadingEvents] = useState(true);

    // Filtros
    const [filterName, setFilterName] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [showUnlinked, setShowUnlinked] = useState(true); // ✅ mostrar notas sin cita

    // Crear/editar
    const [modalOpen, setModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [titulo, setTitulo] = useState('');
    const [contenido, setContenido] = useState('');
    const [files, setFiles] = useState([]);        // nuevos archivos a subir
    const [previews, setPreviews] = useState([]);  // urls creadas con URL.createObjectURL
    const [linkedEventIds, setLinkedEventIds] = useState([]); // ids string de eventos elegidos
    const [existingImages, setExistingImages] = useState([]); // URLs completas existentes
    const [subiendo, setSubiendo] = useState(false);

    // Borrar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);

    // Vista previa de una nota
    const [vistaNota, setVistaNota] = useState(null);
    const modalRef = useRef(null);

    // Paginación simple por “ver más”
    const [visibleNotas, setVisibleNotas] = useState(9);

    // -------------------------------
    // HELPERS DE FORMATEO Y ORDEN
    // -------------------------------

    // Formatea ISO con manejo seguro de fechas inválidas
    const safeFormat = (iso, fmt) => {
        try {
            const d = parseISO(iso || '');
            return isValid(d) ? format(d, fmt, { locale: es }) : 'Fecha desconocida';
        } catch {
            return 'Fecha desconocida';
        }
    };

    // Timestamp numérico para ordenar por “actualizado” o “creado”
    const ts = (n) => {
        const d = Date.parse(n.actualizado_en ?? n.creado_en ?? '');
        return Number.isNaN(d) ? 0 : d;
    };

    // -------------------------------
    // FETCH DE NOTAS
    // -------------------------------
    useEffect(() => {
        if (!token) return;
        setLoadingNotas(true);
        const params = new URLSearchParams({ limit: '100', offset: '0' });

        fetch(`${API_BASE_URL}/api/notas?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (r) => {
                if (r.status === 401) {
                    navigate('/login');
                    throw new Error('Unauthorized');
                }
                if (!r.ok) throw new Error('Error obteniendo notas');
                return r.json();
            })
            .then((data) => {
                // Normalizamos las notas para el cliente
                const norm = (Array.isArray(data) ? data : []).map((n) => ({
                    ...n,
                    eventos: Array.isArray(n.eventos) ? n.eventos : [],
                    imagenes: Array.isArray(n.imagenes) ? n.imagenes : [],
                    creado_en: typeof n.fechacreado === 'string' ? n.fechacreado : '',
                    actualizado_en: typeof n.fechaactualizado === 'string' ? n.fechaactualizado : null,
                }));
                norm.sort((a, b) => ts(b) - ts(a));
                setNotas(norm);
            })
            .catch(console.error)
            .finally(() => setLoadingNotas(false));
    }, [token, navigate]);

    // -------------------------------
    // FETCH DE CALENDARIO (EVENTOS)
    // -------------------------------
    useEffect(() => {
        if (!token) return;
        setLoadingEvents(true);
        fetch(`${API_BASE_URL}/api/calendario`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (r) => {
                if (r.status === 401) {
                    navigate('/login');
                    throw new Error('Unauthorized');
                }
                if (!r.ok) throw new Error('Error obteniendo calendario');
                return r.json();
            })
            .then((data) => {
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
            })
            .catch(console.error)
            .finally(() => setLoadingEvents(false));
    }, [token, navigate]);

    // -------------------------------
    // PREVIEW DE IMÁGENES NUEVAS
    // -------------------------------
    useEffect(() => {
        const urls = files.map((f) => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL); // ✅ evita fugas de memoria
    }, [files]);

    // -------------------------------
    // MEMOS PARA FILTRADO Y SELECT
    // -------------------------------

    // Conjunto de ids de eventos como strings para búsqueda rápida
    const userEventIds = useMemo(() => new Set(events.map((e) => String(e.id))), [events]);

    // Opciones agrupadas por mes para el react-select (calcula 1 vez por cambios en events)
    const selectOptions = useMemo(() => {
        const m = new Map();
        events.forEach((ev) => {
            const arr = m.get(ev.mes) || [];
            arr.push({ value: ev.id, label: ev.label });
            m.set(ev.mes, arr);
        });
        return Array.from(m, ([mes, opts]) => ({ label: mes, options: opts }));
    }, [events]);

    // Filtro: por título, por fecha exacta del evento y (nuevo) mostrar notas sin cita si showUnlinked = true
    const filteredNotas = useMemo(() => {
        const haveEvents = events.length > 0;

        return notas.filter((n) => {
            // ✅ si hay calendario cargado:
            // - si showUnlinked está activo, mostramos también las notas sin eventos
            // - además, filtramos por pertenencia a algún evento del usuario
            const passesEvent = haveEvents
                ? ((showUnlinked && n.eventos.length === 0) ||
                    n.eventos.some((eid) => userEventIds.has(String(eid))))
                : true;

            const nameMatch = filterName
                ? n.titulo.toLowerCase().includes(filterName.toLowerCase())
                : true;

            const dateMatch = filterDate
                ? n.eventos.some((eid) => {
                    const ev = events.find((e) => String(e.id) === String(eid));
                    return ev && format(parseISO(ev.fecha), 'yyyy-MM-dd') === filterDate;
                })
                : true;

            return passesEvent && nameMatch && dateMatch;
        });
    }, [notas, filterName, filterDate, events, userEventIds, showUnlinked]);

    const paginatedNotas = filteredNotas.slice(0, visibleNotas);

    // Conjunto de ids vinculados (solo para el select controlado)
    const linkedIdsSet = useMemo(
        () => new Set(linkedEventIds.map((id) => String(id))),
        [linkedEventIds]
    );

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
        setFiles([]);       // limpiamos nuevos adjuntos
        setPreviews([]);    // limpiamos previews
        setLinkedEventIds(nota.eventos.map((e) => String(e))); // normalizamos a string
        setExistingImages(nota.imagenes);                      // URLs públicas existentes
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
            })
            .catch(() => alert('Error eliminando nota'))
            .finally(() => {
                setConfirmOpen(false);
                setToDelete(null);
            });
    };

    const guardar = () => {
        // Validaciones
        if (!titulo.trim() || !contenido.trim()) {
            return alert('Título y contenido son obligatorios');
        }
        const totalImgs = existingImages.length + files.length;
        if (totalImgs > 3) {
            return alert('Máximo 3 imágenes');
        }
        if (!window.confirm('¿Seguro que quieres guardar la nota?')) return;

        setSubiendo(true);

        // FormData para POST/PATCH multipart
        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        linkedEventIds.forEach((id) => form.append('eventos[]', String(id)));

        // En edición: enviamos los filenames que queremos conservar (keep_imagenes[])
        if (isEditing) {
            existingImages.forEach((url) => {
                // Extract filename (parte final de la URL)
                const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
                form.append('keep_imagenes[]', filename);
            });
        }

        // Adjuntamos los nuevos archivos
        files.forEach((f) => form.append('imagenes', f));

        const url = isEditing ? `${API_BASE_URL}/api/notas/${editId}` : `${API_BASE_URL}/api/notas`;
        fetch(url, {
            method: isEditing ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
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
                // Normalizamos la respuesta del backend para el cliente
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
            })
            .catch((e) => alert(e.message || 'Error guardando nota'))
            .finally(() => setSubiendo(false));
    };

    // Vista previa
    const abrirVista = (nota) => setVistaNota(nota);
    const cerrarVista = () => setVistaNota(null);

    // -------------------------------
    // UX: cerrar modales con ESC
    // -------------------------------
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

    // -------------------------------
    // RENDER
    // -------------------------------
    return (
        <div className="relative min-h-screen px-6 py-10 bg-gray-50">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow mb-6">
                <h1 className="text-2xl font-bold">📝 Mis Notas</h1>
                <button
                    onClick={abrirCrear}
                    className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-full shadow hover:scale-110 transition"
                >
                    +
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-4 mb-6 items-center">
                <div className="flex items-center gap-2 bg-white px-3 py-1 rounded shadow">
                    🔍
                    <input
                        type="text"
                        placeholder="Filtrar título"
                        className="outline-none"
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                    />
                </div>

                <input
                    type="date"
                    className="bg-white px-4 py-2 rounded shadow focus:ring-2 focus:ring-indigo-300"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                />

                {/* ✅ Mostrar/ocultar notas sin cita */}
                <label className="flex items-center gap-2 bg-white px-3 py-2 rounded shadow">
                    <input
                        type="checkbox"
                        checked={showUnlinked}
                        onChange={(e) => setShowUnlinked(e.target.checked)}
                    />
                    Mostrar notas sin cita
                </label>

                <button
                    className="text-sm text-indigo-600 underline"
                    onClick={() => {
                        setFilterName('');
                        setFilterDate('');
                        setShowUnlinked(true);
                    }}
                >
                    Limpiar filtros
                </button>
            </div>

            {/* Contenido */}
            {loadingNotas || loadingEvents ? (
                <div className="text-center py-20 text-gray-400 animate-pulse">Cargando…</div>
            ) : paginatedNotas.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa + para crear una.'
                        : 'No hay notas que coincidan.'}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {paginatedNotas.map((n) => (
                            <div
                                key={n.id}
                                className="bg-white p-4 rounded-xl shadow hover:shadow-lg transition cursor-pointer flex flex-col"
                                onClick={() => abrirVista(n)}
                            >
                                <small className="text-gray-400 text-xs mb-1">
                                    {safeFormat(n.creado_en, "d 'de' MMMM yyyy")}
                                </small>
                                <h2 className="font-semibold text-lg text-gray-800 mb-2 line-clamp-2">{n.titulo}</h2>
                                <p className="text-gray-600 text-sm mb-3 line-clamp-3">{n.contenido}</p>

                                {/* Miniaturas si hay imágenes */}
                                {n.imagenes.length > 0 && (
                                    <div className="flex gap-2 mb-3">
                                        {n.imagenes.map((url, i) => (
                                            <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded" />
                                        ))}
                                    </div>
                                )}

                                {/* Acciones rápidas */}
                                <div className="mt-auto flex justify-end gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            abrirEditar(n);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800"
                                        title="Editar nota"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            confirmarBorrar(n);
                                        }}
                                        className="text-red-500 hover:text-red-700"
                                        title="Eliminar nota"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredNotas.length > visibleNotas && (
                        <div className="text-center mt-8">
                            <button
                                onClick={() => setVisibleNotas((v) => v + 6)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow hover:bg-indigo-700 transition"
                            >
                                Ver más notas
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
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={cerrarVista}
                >
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
                            <section className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {vistaNota.contenido}
                            </section>

                            {vistaNota.imagenes.length > 0 && (
                                <section>
                                    <h3 className="text-lg font-medium mb-2 text-gray-800">Imágenes</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                                    <h3 className="text-lg font-medium mb-2 text-gray-800">Citas relacionadas</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {vistaNota.eventos.map((eid) => {
                                            const ev = events.find((e) => String(e.id) === String(eid));
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
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={() => setModalOpen(false)}
                >
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
                                options={selectOptions} // ✅ memorizado arriba (sin hooks dentro de condiciones)
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
                                                return alert('Máximo 3 imágenes');
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
                                                return alert('Máximo 3 imágenes');
                                            }
                                            setFiles((prev) => [...prev, ...arr]);
                                        }}
                                        disabled={subiendo}
                                    />
                                </label>
                            </div>

                            {/* Previews de nuevas imágenes (se pueden quitar antes de guardar) */}
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

                            {/* Imágenes existentes (se “quitan” de existingImages; el backend conservará solo keep_imagenes[]) */}
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
                            <button
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 bg-gray-300 rounded"
                                disabled={subiendo}
                            >
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
