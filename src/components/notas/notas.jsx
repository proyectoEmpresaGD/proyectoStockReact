import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import { Pencil, Trash2 } from 'lucide-react';

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
    const token = localStorage.getItem('token');

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

    useEffect(() => {
        fetch('/api/notas', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(notasData => {
                const normNotas = notasData.map(n => ({
                    ...n,
                    eventos: Array.isArray(n.eventos) ? n.eventos : [],
                    imagenes: Array.isArray(n.imagenes) ? n.imagenes : [],
                    creado_en: typeof n.creado_en === 'string' ? n.creado_en : '',
                    actualizado_en: typeof n.actualizado_en === 'string' ? n.actualizado_en : null
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
        fetch('/api/calendario', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(eventosData => {
                const regs = Array.isArray(eventosData) ? eventosData : eventosData.registros || [];
                const evs = regs
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
            })
            .catch(console.error);
    }, [token]);

    useEffect(() => {
        const urls = files.map(f => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [files]);

    const filteredNotas = useMemo(() => {
        const ordenadas = [...notas].sort((a, b) => {
            const fechaA = new Date(a.creado_en);
            const fechaB = new Date(b.creado_en);
            return fechaB - fechaA;
        });

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

    const paginatedNotas = useMemo(() => {
        return filteredNotas.slice(0, visibleNotas);
    }, [filteredNotas, visibleNotas]);

    const mostrarMasNotas = () => setVisibleNotas(prev => prev + 9);

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
        window.history.pushState(null, '', window.location.pathname); // Limpiar URL
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
        window.location.hash = '#/notas'; // ✅ Esto limpia correctamente la URL
    };

    const guardar = () => {
        if (!titulo.trim() || !contenido.trim()) return alert('Título y contenido son obligatorios');

        const keepImages = existingImages.filter(url => !toRemoveImages.includes(url));
        const totalImages = keepImages.length + files.length;
        if (totalImages > 3) return alert('Máximo 3 imágenes por nota');

        setSubiendo(true);

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

        const url = isEditing ? `/api/notas/${editId}` : '/api/notas';
        const method = isEditing ? 'PATCH' : 'POST';

        fetch(url, {
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
                    creado_en: nota.creado_en || new Date().toISOString(),
                    actualizado_en: nota.actualizado_en || null
                };
                setNotas(prev => {
                    const updated = isEditing ? prev.map(n => (n.id === editId ? clean : n)) : [clean, ...prev];
                    return updated;
                });
                setFiles([]);
                setPreviews([]);
                setExistingImages(clean.imagenes);

                window.history.pushState(null, '', `#/notas?editar=${clean.id}`);

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
        fetch(`/api/notas/${toDelete.id}`, {
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
        <div className="relative p-6">
            {/* Header */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h1 className="text-2xl font-bold">Mis Notas</h1>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <input
                    type="text"
                    placeholder="🔍 Filtrar por título"
                    className="border rounded px-3 py-2"
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                />
                <input
                    type="date"
                    className="border rounded px-3 py-2"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                />
                <button
                    className="text-sm text-gray-500 underline"
                    onClick={() => {
                        setFilterName('');
                        setFilterDate('');
                    }}
                >
                    Limpiar filtros
                </button>
            </div>
            {loading ? (
                <div className="text-center text-gray-400 py-20 animate-pulse">Cargando tus notas...</div>
            ) : paginatedNotas.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                    {notas.length === 0
                        ? 'Aún no tienes notas. Pulsa + para crear una.'
                        : 'No hay notas que coincidan con los filtros.'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedNotas.map(n => (
                        <div key={n.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
                            <div className="flex justify-between items-start">
                                <h2 className="font-semibold text-lg mb-2 w-full truncate" title={n.titulo}>
                                    {n.titulo}
                                </h2>
                                <div className="space-x-2 flex items-center">
                                    <button onClick={() => abrirEditar(n)} className="text-blue-600 hover:text-blue-800">
                                        <Pencil size={16} />
                                    </button>
                                    <button onClick={() => confirmarBorrar(n)} className="text-red-600 hover:text-red-800">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <p className="flex-1 mb-2 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                {n.contenido}
                            </p>
                            {n.imagenes.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {n.imagenes.map((url, i) => (
                                        <ImagenConLoader
                                            key={i}
                                            src={`${url}?v=${n.actualizado_en || n.creado_en}`}
                                            alt={`img-${i}`}
                                            onClick={() => window.open(url, '_blank')}
                                        />
                                    ))}
                                </div>
                            )}
                            {n.eventos.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {n.eventos.map(eid => {
                                        const ev = events.find(e => String(e.id) === String(eid));
                                        return (
                                            <span key={eid} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                                {ev?.label ?? eid}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            {n.creado_en && isValid(parseISO(n.creado_en)) && (
                                <small className="text-gray-400">
                                    {format(parseISO(n.creado_en), "d 'de' MMMM yyyy, HH:mm:ss", { locale: es })}
                                </small>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Botón ver más */}
            {visibleNotas < filteredNotas.length && (
                <div className="text-center mt-6">
                    <button
                        onClick={mostrarMasNotas}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                        Ver más notas
                    </button>
                </div>
            )}

            {/* Botón crear */}
            <button
                onClick={abrirCrear}
                className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl"
            >
                +
            </button>

            {/* Modal Crear/Editar */}
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
                                        if (!acc.has(ev.mes)) acc.set(ev.mes, []); // ✅ CAMPO CORRECTO
                                        acc.get(ev.mes).push({
                                            value: ev.id,
                                            label: ev.label
                                        });
                                        return acc;
                                    }, new Map())
                                ).map(([mes, opciones]) => ({ label: mes, options: opciones }))}

                                value={events
                                    .filter(ev => linkedEventIds.includes(ev.id))
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

                            {/* Previsualización de nuevas imágenes */}
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

                            {/* Imágenes existentes */}
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

            {/* Confirmación borrado */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs text-center">
                        <p className="mb-4 text-lg">¿Deseas eliminar esta nota?</p>
                        <div className="flex justify-center space-x-3">
                            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 bg-gray-300 text-gray-800 rounded">
                                Cancelar
                            </button>
                            <button onClick={borrar} className="px-4 py-2 bg-red-500 text-white rounded">
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

}
