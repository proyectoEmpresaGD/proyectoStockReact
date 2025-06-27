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

// Carga progresiva de imágenes
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

export default function NotasPage() {
    const { token } = useAuthContext();
    const navigate = useNavigate();

    // Estados principales
    const [notas, setNotas] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterName, setFilterName] = useState('');
    const [filterDate, setFilterDate] = useState('');

    // Crear/editar
    const [modalOpen, setModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [titulo, setTitulo] = useState('');
    const [contenido, setContenido] = useState('');
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [linkedEventIds, setLinkedEventIds] = useState([]);
    const [existingImages, setExistingImages] = useState([]);
    const [toRemoveImages, setToRemoveImages] = useState([]);
    const [subiendo, setSubiendo] = useState(false);

    // Borrar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);

    // Vista previa nota
    const [vistaNota, setVistaNota] = useState(null);
    const modalRef = useRef(null);

    // Mostrar más
    const [visibleNotas, setVisibleNotas] = useState(9);

    // IDs de eventos del usuario
    const userEventIds = useMemo(() => new Set(events.map(e => String(e.id))), [events]);

    // Fetch inicial de notas
    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/notas`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                const norm = data.map(n => ({
                    ...n,
                    eventos: Array.isArray(n.eventos) ? n.eventos : [],
                    imagenes: Array.isArray(n.imagenes) ? n.imagenes : [],
                    creado_en: typeof n.fechacreado === 'string' ? n.fechacreado : '',
                    actualizado_en: typeof n.fechaactualizado === 'string' ? n.fechaactualizado : null,
                }));
                norm.sort((a, b) =>
                    new Date(b.actualizado_en || b.creado_en) - new Date(a.actualizado_en || a.creado_en)
                );
                setNotas(norm);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [token]);

    // Fetch de eventos para el Select y para enlazar
    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/calendario`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                const registros = Array.isArray(data) ? data : data.registros || [];
                const evs = registros
                    .filter(evt => typeof evt.fecha === 'string' && isValid(parseISO(evt.fecha)))
                    .map(evt => {
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
            .catch(console.error);
    }, [token]);

    // Previsualizaciones de imágenes nuevas
    useEffect(() => {
        const urls = files.map(f => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [files]);

    // Filtrado de notas
    const filteredNotas = useMemo(
        () =>
            notas.filter(n => {
                if (!n.eventos.some(eid => userEventIds.has(String(eid)))) return false;
                const nameMatch = filterName
                    ? n.titulo.toLowerCase().includes(filterName.toLowerCase())
                    : true;
                const dateMatch = filterDate
                    ? n.eventos.some(eid => {
                        const ev = events.find(e => String(e.id) === String(eid));
                        return ev && format(parseISO(ev.fecha), 'yyyy-MM-dd') === filterDate;
                    })
                    : true;
                return nameMatch && dateMatch;
            }),
        [notas, filterName, filterDate, events, userEventIds]
    );

    const paginatedNotas = filteredNotas.slice(0, visibleNotas);

    // CRUD handlers
    const abrirCrear = () => {
        setIsEditing(false);
        setEditId(null);
        setTitulo('');
        setContenido('');
        setFiles([]);
        setPreviews([]);
        setLinkedEventIds([]);
        setExistingImages([]);
        setToRemoveImages([]);
        setModalOpen(true);
    };
    const abrirEditar = nota => {
        setIsEditing(true);
        setEditId(nota.id);
        setTitulo(nota.titulo);
        setContenido(nota.contenido);
        setFiles([]);
        setPreviews([]);
        setLinkedEventIds(nota.eventos);
        setExistingImages(nota.imagenes);
        setToRemoveImages([]);
        setModalOpen(true);
    };
    const confirmarBorrar = nota => {
        setToDelete(nota);
        setConfirmOpen(true);
    };
    const borrar = () => {
        if (!toDelete) return;
        fetch(`${API_BASE_URL}/api/notas/${toDelete.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => {
                if (!r.ok) throw new Error();
                setNotas(prev => prev.filter(n => n.id !== toDelete.id));
            })
            .catch(() => alert('Error eliminando nota'))
            .finally(() => {
                setConfirmOpen(false);
                setToDelete(null);
            });
    };
    const guardar = () => {
        if (!titulo.trim() || !contenido.trim()) {
            return alert('Título y contenido son obligatorios');
        }
        const keep = existingImages.filter(url => !toRemoveImages.includes(url));
        if (keep.length + files.length > 3) {
            return alert('Máximo 3 imágenes');
        }
        if (!window.confirm('¿Seguro que quieres guardar la nota?')) return;
        setSubiendo(true);
        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        linkedEventIds.forEach(id => form.append('eventos[]', id));
        keep.forEach(url => {
            const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
            form.append('keep_imagenes[]', filename);
        });
        files.forEach(f => form.append('imagenes', f));

        const url = isEditing
            ? `${API_BASE_URL}/api/notas/${editId}`
            : `${API_BASE_URL}/api/notas`;
        fetch(url, {
            method: isEditing ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        })
            .then(r => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(newNota => {
                const norm = {
                    ...newNota,
                    eventos: Array.isArray(newNota.eventos) ? newNota.eventos : [],
                    imagenes: Array.isArray(newNota.imagenes) ? newNota.imagenes : [],
                    creado_en: newNota.fechacreado || new Date().toISOString(),
                    actualizado_en: newNota.fechaactualizado || null,
                };
                setNotas(prev =>
                    isEditing ? prev.map(n => (n.id === editId ? norm : n)) : [norm, ...prev]
                );
                setModalOpen(false);
            })
            .catch(() => alert('Error guardando nota'))
            .finally(() => setSubiendo(false));
    };
    const abrirVista = nota => setVistaNota(nota);
    const cerrarVista = () => setVistaNota(null);

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
            <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex items-center gap-2 bg-white px-3 py-1 rounded shadow">
                    🔍
                    <input
                        type="text"
                        placeholder="Filtrar título"
                        className="outline-none"
                        value={filterName}
                        onChange={e => setFilterName(e.target.value)}
                    />
                </div>
                <input
                    type="date"
                    className="bg-white px-4 py-2 rounded shadow focus:ring-2 focus:ring-indigo-300"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                />
                <button
                    className="text-sm text-indigo-600 underline"
                    onClick={() => {
                        setFilterName('');
                        setFilterDate('');
                    }}
                >
                    Limpiar filtros
                </button>
            </div>

            {/* Contenido */}
            {loading ? (
                <div className="text-center py-20 text-gray-400 animate-pulse">Cargando notas…</div>
            ) : paginatedNotas.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa + para crear una.'
                        : 'No hay notas que coincidan.'}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {paginatedNotas.map(n => (
                            <div
                                key={n.id}
                                className="bg-white p-4 rounded-xl shadow hover:shadow-lg transition cursor-pointer flex flex-col"
                                onClick={() => abrirVista(n)}
                            >
                                <small className="text-gray-400 text-xs mb-1">
                                    {format(parseISO(n.creado_en), "d 'de' MMMM yyyy", { locale: es })}
                                </small>
                                <h2 className="font-semibold text-lg text-gray-800 mb-2 line-clamp-2">
                                    {n.titulo}
                                </h2>
                                <p className="text-gray-600 text-sm mb-3 line-clamp-3">{n.contenido}</p>
                                {n.imagenes.length > 0 && (
                                    <div className="flex gap-2 mb-3">
                                        {n.imagenes.map((url, i) => (
                                            <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded" />
                                        ))}
                                    </div>
                                )}
                                <div className="mt-auto flex justify-end gap-2">
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            abrirEditar(n);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            confirmarBorrar(n);
                                        }}
                                        className="text-red-500 hover:text-red-700"
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
                                onClick={() => setVisibleNotas(v => v + 6)}
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

            {/* Vista previa */}
            {vistaNota && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={cerrarVista}
                >
                    <div
                        ref={modalRef}
                        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden"
                        onClick={e => e.stopPropagation()}
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
                                    <h3 className="text-lg font-medium mb-2 text-gray-800">
                                        Citas relacionadas
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {vistaNota.eventos.map(eid => {
                                            const ev = events.find(e => String(e.id) === String(eid));
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
                            Creado el{' '}
                            {format(parseISO(vistaNota.creado_en), "d 'de' MMMM yyyy, HH:mm:ss", {
                                locale: es,
                            })}
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
                        onClick={e => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-bold mb-4">
                            {isEditing ? 'Editar nota' : 'Crear nota'}
                        </h2>

                        {/* Título */}
                        <input
                            type="text"
                            placeholder="Título"
                            className="w-full border px-3 py-2 rounded mb-4"
                            value={titulo}
                            onChange={e => setTitulo(e.target.value)}
                        />

                        {/* Contenido */}
                        <textarea
                            placeholder="Contenido"
                            className="w-full border px-3 py-2 rounded h-24 mb-4"
                            value={contenido}
                            onChange={e => setContenido(e.target.value)}
                        />

                        {/* Select citas relacionadas */}
                        <div className="mb-4">
                            <label className="block mb-1 font-medium">Citas relacionadas</label>
                            <Select
                                isMulti
                                options={(() => {
                                    const m = new Map();
                                    events.forEach(ev => {
                                        const arr = m.get(ev.mes) || [];
                                        arr.push({ value: ev.id, label: ev.label });
                                        m.set(ev.mes, arr);
                                    });
                                    return Array.from(m, ([mes, opts]) => ({ label: mes, options: opts }));
                                })()}
                                value={events
                                    .filter(ev => linkedEventIds.includes(ev.id))
                                    .map(ev => ({ value: ev.id, label: ev.label }))}
                                onChange={sel => setLinkedEventIds(sel.map(o => o.value))}
                                classNamePrefix="react-select"
                                placeholder="Busca por mes…"
                            />
                        </div>

                        {/* Imágenes */}
                        <div className="mb-4">
                            <label className="block mb-1 font-medium">Imágenes (max 3)</label>
                            <div className="flex gap-2 mb-2">
                                <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded cursor-pointer">
                                    📷
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={e => {
                                            const f = Array.from(e.target.files);
                                            if (f.length + existingImages.length + previews.length > 3) {
                                                return alert('Máximo 3 imágenes');
                                            }
                                            setFiles(prev => [...prev, ...f]);
                                        }}
                                    />
                                </label>
                                <label className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded cursor-pointer">
                                    🖼️
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={e => {
                                            const f = Array.from(e.target.files);
                                            if (f.length + existingImages.length + previews.length > 3) {
                                                return alert('Máximo 3 imágenes');
                                            }
                                            setFiles(prev => [...prev, ...f]);
                                        }}
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
                                                    setPreviews(p => p.filter((_, idx) => idx !== i));
                                                    setFiles(f => f.filter((_, idx) => idx !== i));
                                                }}
                                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
                                                    setToRemoveImages(t => [...t, url]);
                                                    setExistingImages(e => e.filter(u => u !== url));
                                                }}
                                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded">
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
