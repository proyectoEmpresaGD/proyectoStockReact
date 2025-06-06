import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../Auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function ImagenConLoader({ src, alt, onClick }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className="relative w-16 h-16">
            {!loaded && <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onClick={onClick}
                className={`w-16 h-16 object-cover rounded cursor-pointer transition duration-300 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
        </div>
    );
}

export default function NotasPage() {
    const { token } = useAuthContext();

    const [notas, setNotas] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterName, setFilterName] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [titulo, setTitulo] = useState('');
    const [contenido, setContenido] = useState('');
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [linkedEventIds, setLinkedEventIds] = useState([]);
    const [existingImages, setExistingImages] = useState([]);
    const [toRemoveImages, setToRemoveImages] = useState([]);
    const [subiendo, setSubiendo] = useState(false);
    const [visibleNotas, setVisibleNotas] = useState(9);
    const [vistaNota, setVistaNota] = useState(null);
    // Dentro de tu componente de citas o calendario
    const [eventoRelacionado, setEventoRelacionado] = useState(null);

    const abrirModalNota = (evento) => {
        setEventoRelacionado(evento.id);  // 👈 Pasas el ID de la cita actual
        setModalOpen(true);
    };

    const abrirVista = (nota) => setVistaNota(nota);
    const cerrarVista = () => setVistaNota(null);
    useEffect(() => {
        if (modalOpen && eventoRelacionado) {
            setLinkedEventIds([eventoRelacionado]);
        }
    }, [modalOpen, eventoRelacionado]);


    useEffect(() => {
        if (!token) return;

        fetch(`${API_BASE_URL}/api/notas`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(notasData => {
                const normNotas = notasData.map(n => ({
                    ...n,
                    eventos: Array.isArray(n.eventos) ? n.eventos : [],
                    imagenes: Array.isArray(n.imagenes) ? n.imagenes : [],
                    creado_en: typeof n.fechacreado === 'string' ? n.fechacreado : '',
                    actualizado_en: typeof n.fechaactualizado === 'string' ? n.fechaactualizado : null
                }));
                const ordenadas = normNotas.sort((a, b) => {
                    const fechaA = new Date(a.actualizado_en || a.creado_en);
                    const fechaB = new Date(b.actualizado_en || b.creado_en);
                    return fechaB - fechaA;
                });
                setNotas(ordenadas);
                localStorage.setItem('cachedNotas', JSON.stringify(ordenadas));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [token]);


    useEffect(() => {
        if (!token || token.length < 10) return;

        const fetchEventos = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/calendario`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('⚠️ Error HTTP:', response.status, errorText);
                    return;
                }

                const eventosData = await response.json();
                const registros = Array.isArray(eventosData) ? eventosData : eventosData.registros || [];

                const evs = registros
                    .filter(evt => typeof evt.fecha === 'string' && isValid(parseISO(evt.fecha)))
                    .map(evt => {
                        const fechaISO = parseISO(evt.fecha);
                        return {
                            id: String(evt.id),
                            fecha: evt.fecha,
                            mes: format(fechaISO, 'MMMM yyyy', { locale: es }),
                            label: `${evt.descripcion} – ${format(fechaISO, "d 'de' MMMM yyyy", { locale: es })}`
                        };
                    });

                setEvents(evs);
            } catch (error) {
                console.error('❌ Error al obtener citas:', error);
            }
        };

        fetchEventos();
    }, [token]);

    useEffect(() => {
        const urls = files.map(f => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [files]);

    const filteredNotas = useMemo(() => {
        const ordenadas = [...notas].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));

        return ordenadas.filter(n => {
            const title = n.titulo.toLowerCase();
            const nameMatch = filterName ? title.includes(filterName.trim().toLowerCase()) : false;
            const dateMatch = filterDate
                ? n.eventos.some(eid => {
                    const ev = events.find(e => String(e.id) === String(eid));
                    return ev?.fecha === filterDate;
                })
                : false;
            if (!filterName && !filterDate) return true;
            return nameMatch || dateMatch;
        });
    }, [notas, filterName, filterDate, events]);

    const paginatedNotas = useMemo(() => filteredNotas.slice(0, visibleNotas), [filteredNotas, visibleNotas]);

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
        window.history.pushState(null, '', window.location.pathname);
    };

    const abrirEditar = (nota) => {
        window.history.pushState(null, '', `#/notas?editar=${nota.id}`);
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

    const cerrarModal = () => {
        setModalOpen(false);
        setIsEditing(false);
        setEditId(null);
        window.location.hash = '#/notas';
    };

    const guardar = () => {
        if (!titulo.trim() || !contenido.trim()) return alert('Título y contenido son obligatorios');

        const keepImages = existingImages.filter(url => !toRemoveImages.includes(url));
        const totalImages = keepImages.length + files.length;
        if (totalImages > 3) return alert('Máximo 3 imágenes por nota');

        setSubiendo(true);

        // Carga optimista
        const tempId = Date.now();
        const notaTemporal = {
            id: tempId,
            titulo,
            contenido,
            eventos: linkedEventIds,
            imagenes: previews,
            creado_en: new Date().toISOString(),
            actualizado_en: null
        };
        if (!isEditing) {
            setNotas(prev => [notaTemporal, ...prev]);
        }

        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        linkedEventIds.forEach(id => form.append('eventos[]', id));

        if (isEditing) {
            keepImages.forEach(url => {
                try {
                    const cleanUrl = url.split('?')[0];
                    const filename = decodeURIComponent(cleanUrl.split('/').pop());
                    form.append('keep_imagenes[]', filename);
                } catch (err) {
                    console.warn('Error procesando imagen existente:', url);
                }
            });
        }

        files.forEach(f => form.append('imagenes', f));

        const endpoint = isEditing
            ? `${API_BASE_URL}/api/notas/${editId}`
            : `${API_BASE_URL}/api/notas`;
        const method = isEditing ? 'PATCH' : 'POST';

        fetch(endpoint, {
            method,
            headers: { Authorization: `Bearer ${token}` },
            body: form
        })
            .then(r => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(nota => {
                const clean = {
                    ...nota,
                    eventos: Array.isArray(nota.eventos) ? nota.eventos : [],
                    imagenes: Array.isArray(nota.imagenes) ? nota.imagenes : [],
                    creado_en: nota.fechacreado || new Date().toISOString(),
                    actualizado_en: nota.fechaactualizado || null
                };
                setNotas(prev =>
                    isEditing
                        ? prev.map(n => (n.id === editId ? clean : n))
                        : [clean, ...prev.filter(n => n.id !== tempId)]
                );
                cerrarModal();
            })
            .catch(() => alert(`Error ${isEditing ? 'editando' : 'creando'} nota`))
            .finally(() => setSubiendo(false));
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

    useEffect(() => {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        const notaId = params.get('editar');
        if (notaId && notas.length > 0) {
            const nota = notas.find(n => String(n.id) === notaId);
            if (nota) abrirEditar(nota);
        }
    }, [notas]);


    return (
        <div className="relative min-h-screen px-6 py-10 bg-gradient-to-br from-yellow-100 via-orange-100 to-yellow-50">
            {/* Encabezado */}
            <div className="bg-white/90 backdrop-blur-sm shadow-sm border border-gray-200 rounded-xl px-6 py-4 mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">📝 Mis Notas</h1>
                <button
                    onClick={abrirCrear}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white w-10 h-10 rounded-full shadow-md text-xl flex items-center justify-center transition-transform hover:scale-110 self-center"
                >
                    +
                </button>

            </div>
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2 border rounded-lg px-3 py-1 bg-white shadow-sm">
                    <span className="text-gray-500">🔍</span>
                    <input
                        type="text"
                        placeholder="Filtrar por título"
                        className="outline-none bg-transparent"
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                    />
                </div>
                <input
                    type="date"
                    className="border border-gray-300 rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
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

            {/* Estado de carga / sin resultados */}
            {loading ? (
                <div className="text-center text-gray-400 py-20 animate-pulse">Cargando tus notas...</div>
            ) : paginatedNotas.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa + para crear una.'
                        : 'No hay notas que coincidan con los filtros.'}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {paginatedNotas.map((n) => (
                            <div
                                key={n.id}
                                className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 flex flex-col justify-between hover:shadow-xl hover:scale-[1.01] transition cursor-pointer"
                                onClick={(e) => {
                                    if (e.target.closest('button')) return;
                                    abrirVista(n);
                                }}
                            >
                                {/* Fecha */}
                                {n.creado_en && isValid(parseISO(n.creado_en)) && (
                                    <small className="text-gray-400 text-xs mb-2">
                                        {format(parseISO(n.creado_en), "d 'de' MMMM yyyy, HH:mm:ss", { locale: es })}
                                    </small>
                                )}
                                {/* Título */}
                                <h2 className="font-bold text-lg text-gray-800 break-words line-clamp-2 mb-1">{n.titulo}</h2>
                                {/* Contenido */}
                                <p className="text-sm text-gray-600 mb-2 line-clamp-3">{n.contenido}</p>
                                {/* Imágenes */}
                                {n.imagenes.length > 0 && (
                                    <div className="flex gap-2 mb-2">
                                        {n.imagenes.map((url, i) => (
                                            <img
                                                key={i}
                                                src={`${url}?v=${n.actualizado_en || n.creado_en}`}
                                                alt={`img-${i}`}
                                                className="w-14 h-14 object-cover rounded shadow-sm hover:scale-105 transition cursor-pointer"
                                                onClick={() => window.open(url, '_blank')}
                                            />
                                        ))}
                                    </div>
                                )}
                                {/* Eventos */}
                                {n.eventos.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {n.eventos.map((eid) => {
                                            const ev = events.find((e) => String(e.id) === String(eid));
                                            return (
                                                <span
                                                    key={eid}
                                                    className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full"
                                                >
                                                    {ev?.label ?? eid}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* Acciones */}
                                <div className="flex justify-end items-center mt-auto pt-2 gap-3">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            abrirEditar(n);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => {
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

                    {/* Botón Ver más */}
                    {filteredNotas.length > visibleNotas && (
                        <div className="text-center mt-8">
                            <button
                                onClick={() => setVisibleNotas(prev => prev + 6)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow hover:bg-indigo-700 transition"
                            >
                                Ver más notas
                            </button>
                        </div>
                    )}
                </>
            )}
            {vistaNota && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-2xl p-6 w-full max-w-4xl space-y-4 overflow-y-auto max-h-[95vh]">
                        <button
                            onClick={cerrarVista}
                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xl"
                        >
                            ×
                        </button>

                        {/* Título */}
                        <h2 className="text-2xl font-bold text-gray-800 mb-2 break-words">{vistaNota.titulo}</h2>

                        {/* Contenido */}
                        <div className="text-sm text-gray-700 mb-4 whitespace-pre-wrap break-words">{vistaNota.contenido}</div>

                        {/* Imágenes */}
                        {vistaNota.imagenes.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {vistaNota.imagenes.map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt={`preview-${i}`}
                                        className="w-32 h-32 object-cover rounded shadow cursor-pointer hover:scale-105 transition"
                                        onClick={() => window.open(url, '_blank')}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Eventos */}
                        {vistaNota.eventos.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {vistaNota.eventos.map((eid) => {
                                    const ev = events.find((e) => String(e.id) === String(eid));
                                    return (
                                        <span
                                            key={eid}
                                            className="text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full"
                                        >
                                            {ev?.label ?? eid}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Fecha */}
                        <p className="mt-auto text-xs text-gray-400">
                            Creado el: {format(parseISO(vistaNota.creado_en), "d 'de' MMMM yyyy, HH:mm:ss", { locale: es })}
                        </p>
                    </div>
                </div>
            )}


            {modalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl space-y-4 overflow-y-auto max-h-[95vh]">
                        <h2 className="text-xl font-bold">{isEditing ? 'Editar nota' : 'Crear nota'}</h2>

                        <input
                            type="text"
                            placeholder="Título"
                            className="w-full border border-gray-300 rounded px-3 py-2"
                            value={titulo}
                            onChange={e => setTitulo(e.target.value)}
                        />
                        <textarea
                            placeholder="Contenido"
                            className="w-full border border-gray-300 rounded px-3 py-2 h-24"
                            value={contenido}
                            onChange={e => setContenido(e.target.value)}
                        />

                        {/* Selector citas agrupado */}
                        <div>
                            <label className="block mb-1 font-medium">Relacionar con citas:</label>
                            <Select
                                isMulti
                                options={Array.from(
                                    events.reduce((acc, ev) => {
                                        if (!acc.has(ev.mes)) acc.set(ev.mes, []);
                                        acc.get(ev.mes).push({
                                            value: ev.id,
                                            label: ev.label
                                        });
                                        return acc;
                                    }, new Map())
                                ).map(([mes, opciones]) => ({ label: mes, options: opciones }))}

                                value={events
                                    .filter(ev =>
                                        (eventoRelacionado ? [eventoRelacionado] : linkedEventIds).includes(ev.id)
                                    )
                                    .map(ev => ({
                                        value: ev.id,
                                        label: `${format(parseISO(ev.fecha), "d 'de' MMMM yyyy", { locale: es })} – ${ev.label.split('–')[0]}`
                                    }))}
                                onChange={selected => setLinkedEventIds(selected.map(opt => opt.value))}
                                className="react-select-container"
                                classNamePrefix="react-select"
                                placeholder="Buscar y seleccionar citas por mes..."
                            />
                        </div>

                        {/* Imágenes */}
                        <div>
                            <label className="block mb-1 font-medium">Imágenes (max 3):</label>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={e => {
                                    const selected = Array.from(e.target.files);
                                    const total = files.length + existingImages.length + selected.length;
                                    if (total > 3) {
                                        alert('Máximo 3 imágenes por nota');
                                        return;
                                    }
                                    setFiles(prev => [...prev, ...selected]);
                                    setPreviews(prev => [...prev, ...selected.map(f => URL.createObjectURL(f))]);
                                }}
                            />

                            {previews.length > 0 && (
                                <div className="flex gap-2 mt-2">
                                    {previews.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img src={url} className="w-16 h-16 object-cover rounded" alt={`preview-${i}`} />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newPrevs = [...previews];
                                                    newPrevs.splice(i, 1);
                                                    setPreviews(newPrevs);

                                                    const newFiles = [...files];
                                                    newFiles.splice(i, 1);
                                                    setFiles(newFiles);
                                                }}
                                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {existingImages.length > 0 && (
                                <div className="flex gap-2 mt-2">
                                    {existingImages.map((url, i) => (
                                        <div key={i} className="relative">
                                            <img src={url} className="w-16 h-16 object-cover rounded" alt={`existing-${i}`} />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setToRemoveImages(prev => [...prev, url]);
                                                    setExistingImages(prev => prev.filter(u => u !== url));
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

                        <div className="flex justify-end space-x-2">
                            <button onClick={cerrarModal} className="px-4 py-2 bg-gray-300 rounded">
                                Cancelar
                            </button>
                            <button onClick={guardar} className="px-4 py-2 bg-blue-600 text-white rounded">
                                {isEditing ? 'Actualizar' : 'Guardar'}
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );

}
