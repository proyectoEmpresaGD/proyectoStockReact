// src/components/notas/NoteModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { FiCamera, FiUpload, FiTrash2 } from 'react-icons/fi';

export default function NoteModal({ token, eventId, nota, onClose, onSaved }) {
    const isEditing = Boolean(nota);
    const [titulo, setTitulo] = useState(nota?.titulo || '');
    const [contenido, setContenido] = useState(nota?.contenido || '');
    const [existingImages, setExistingImages] = useState(nota?.imagenes || []); // URLs
    const [newFiles, setNewFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [saving, setSaving] = useState(false);
    const abortRef = useRef(null);

    const MB = 6;
    const urlToFilename = (url) =>
        decodeURIComponent(url.split('/').pop().split('?')[0]);

    const handleNewFiles = (files) => {
        const arr = Array.from(files || [])
            .filter((f) => /^image\//.test(f.type))
            .filter((f) => f.size <= MB * 1024 * 1024);
        const total = existingImages.length + newFiles.length + arr.length;
        if (total > 3) return alert('Máximo 3 imágenes por nota');
        const dedup = arr.filter(
            (nf) => !newFiles.some((f) => f.name === nf.name && f.size === nf.size)
        );
        setNewFiles((prev) => [...prev, ...dedup]);
    };

    const removeExisting = (url) => {
        setExistingImages((prev) => prev.filter((u) => u !== url));
    };
    const removeNew = (idx) => {
        setNewFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    useEffect(() => {
        const urls = newFiles.map((f) => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(URL.revokeObjectURL);
    }, [newFiles]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const handleSubmit = async () => {
        if (!titulo.trim() || !contenido.trim()) {
            return alert('Completa título y contenido');
        }
        if (!window.confirm('¿Seguro que quieres guardar la nota?')) {
            return;
        }
        if (saving) return;
        setSaving(true);

        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        // soporta uno o varios ids
        [].concat(eventId).filter(Boolean).forEach((id) => form.append('eventos[]', String(id)));

        // En PATCH, enviar keep_imagenes[] (filenames de las que se quedan)
        if (isEditing) {
            existingImages.forEach((url) => form.append('keep_imagenes[]', urlToFilename(url)));
        }
        newFiles.forEach((f) => form.append('imagenes', f));

        try {
            abortRef.current = new AbortController();
            const base = import.meta.env.VITE_API_BASE_URL;
            const url = isEditing ? `${base}/api/notas/${nota.id}` : `${base}/api/notas`;
            const method = isEditing ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: form,
                signal: abortRef.current.signal
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.error || `Error ${res.status}`);
            }
            const saved = await res.json();
            onSaved(saved);
        } catch (err) {
            console.error(err);
            alert(err.message || 'Error al guardar la nota');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-auto overflow-y-auto max-h-full">
                <div className="p-6">
                    <h3 className="text-xl font-semibold mb-4">
                        {isEditing ? 'Editar nota' : 'Nueva nota'}
                    </h3>

                    <input
                        type="text"
                        placeholder="Título"
                        className="w-full border rounded px-3 py-2 mb-3"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        disabled={saving}
                    />

                    <textarea
                        rows={4}
                        placeholder="Contenido"
                        className="w-full border rounded px-3 py-2 mb-3"
                        value={contenido}
                        onChange={(e) => setContenido(e.target.value)}
                        disabled={saving}
                    />

                    {existingImages.length > 0 && (
                        <div className="mb-3">
                            <p className="font-medium mb-2">Imágenes actuales:</p>
                            <div className="flex flex-wrap gap-2">
                                {existingImages.map((url, i) => (
                                    <div key={i} className="relative">
                                        <img
                                            src={url}
                                            alt={`img-${i}`}
                                            className="w-16 h-16 object-cover rounded"
                                        />
                                        <button
                                            onClick={() => removeExisting(url)}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                                            disabled={saving}
                                        >
                                            <FiTrash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-3 space-y-2">
                        <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded cursor-pointer">
                            <FiCamera />
                            Tomar foto
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleNewFiles(e.target.files)}
                                disabled={saving}
                            />
                        </label>
                        <label className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded cursor-pointer">
                            <FiUpload />
                            Subir imagen
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleNewFiles(e.target.files)}
                                disabled={saving}
                            />
                        </label>
                    </div>

                    {previews.length > 0 && (
                        <div className="mb-3">
                            <p className="font-medium mb-2">Imágenes por añadir:</p>
                            <div className="flex flex-wrap gap-2">
                                {previews.map((url, i) => (
                                    <div key={i} className="relative">
                                        <img src={url} alt={`new-${i}`} className="w-16 h-16 object-cover rounded" />
                                        <button
                                            onClick={() => removeNew(i)}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                                            disabled={saving}
                                        >
                                            <FiTrash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                            disabled={saving}
                        >
                            {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
