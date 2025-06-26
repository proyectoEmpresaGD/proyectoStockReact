// src/components/agenda/NoteModal.jsx
import React, { useState, useEffect } from 'react';
import { FiCamera, FiUpload, FiTrash2 } from 'react-icons/fi';

export default function NoteModal({ token, eventId, nota, onClose, onSaved }) {
    const isEditing = Boolean(nota);
    const [titulo, setTitulo] = useState(nota?.titulo || '');
    const [contenido, setContenido] = useState(nota?.contenido || '');
    const [existingImages, setExistingImages] = useState(nota?.imagenes || []);
    const [removedImages, setRemovedImages] = useState([]);
    const [newFiles, setNewFiles] = useState([]);

    // manejar selección de nuevas imágenes
    const handleNewFiles = (files) => {
        const arr = Array.from(files);
        if (existingImages.length - removedImages.length + newFiles.length + arr.length > 3) {
            return alert('Máximo 3 imágenes por nota');
        }
        setNewFiles(prev => [...prev, ...arr]);
    };

    // eliminar imagen existente
    const removeExisting = (url) => {
        setRemovedImages(prev => [...prev, url]);
        setExistingImages(prev => prev.filter(u => u !== url));
    };

    // eliminar nueva imagen
    const removeNew = (idx) => {
        setNewFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        if (!titulo.trim() || !contenido.trim()) {
            return alert('Completa título y contenido');
        }

        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        // para creación / edición vinculamos la nota al evento
        form.append('eventos[]', String(eventId));

        // si estamos editando, decimos al backend qué URLs borrar
        if (isEditing) {
            removedImages.forEach(url => form.append('removed_images[]', url));
        }

        // adjuntamos nuevas imágenes
        newFiles.forEach(file => form.append('imagenes', file));

        try {
            const url = isEditing
                ? `${import.meta.env.VITE_API_BASE_URL}/api/notas/${nota.id}`
                : `${import.meta.env.VITE_API_BASE_URL}/api/notas`;
            const method = isEditing ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: form
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const saved = await res.json();
            onSaved(saved);
        } catch (err) {
            console.error(err);
            alert('Error al guardar la nota');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-auto overflow-y-auto max-h-full">
                <div className="p-6">
                    <h3 className="text-xl font-semibold mb-4">
                        {isEditing ? 'Editar nota' : 'Nueva nota'}
                    </h3>

                    {/* Título */}
                    <input
                        type="text"
                        placeholder="Título"
                        className="w-full border rounded px-3 py-2 mb-3"
                        value={titulo}
                        onChange={e => setTitulo(e.target.value)}
                    />

                    {/* Contenido */}
                    <textarea
                        rows={4}
                        placeholder="Contenido"
                        className="w-full border rounded px-3 py-2 mb-3"
                        value={contenido}
                        onChange={e => setContenido(e.target.value)}
                    />

                    {/* Imágenes existentes */}
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
                                        >
                                            <FiTrash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Botones para añadir nuevas imágenes */}
                    <div className="mb-3 space-y-2">
                        <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded cursor-pointer">
                            <FiCamera />
                            Tomar foto
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={e => handleNewFiles(e.target.files)}
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
                                onChange={e => handleNewFiles(e.target.files)}
                            />
                        </label>
                    </div>

                    {/* Previsualización de nuevas imágenes */}
                    {newFiles.length > 0 && (
                        <div className="mb-3">
                            <p className="font-medium mb-2">Imágenes por añadir:</p>
                            <div className="flex flex-wrap gap-2">
                                {newFiles.map((file, i) => (
                                    <div key={i} className="relative">
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={`new-${i}`}
                                            className="w-16 h-16 object-cover rounded"
                                        />
                                        <button
                                            onClick={() => removeNew(i)}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                                        >
                                            <FiTrash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Botones de acción */}
                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                            {isEditing ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
