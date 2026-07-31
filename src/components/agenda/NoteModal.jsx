// src/components/notas/NoteModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { FiCamera, FiUpload, FiTrash2 } from 'react-icons/fi';
import { FaTimes } from 'react-icons/fa';
import InlineSpinner from '../common/InlineSpinner.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { toast } from 'react-toastify';

export default function NoteModal({ token, eventId, nota, onClose, onSaved }) {
    const isEditing = Boolean(nota);
    const [titulo, setTitulo] = useState(nota?.titulo || '');
    const [contenido, setContenido] = useState(nota?.contenido || '');
    const [existingImages, setExistingImages] = useState(nota?.imagenes || []); // URLs
    const [newFiles, setNewFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [saving, setSaving] = useState(false);
    const [confirmSave, setConfirmSave] = useState(false);
    const abortRef = useRef(null);

    const MB = 6;
    const urlToFilename = (url) =>
        decodeURIComponent(url.split('/').pop().split('?')[0]);

    const handleNewFiles = (files) => {
        const arr = Array.from(files || [])
            .filter((f) => /^image\//.test(f.type))
            .filter((f) => f.size <= MB * 1024 * 1024);
        const total = existingImages.length + newFiles.length + arr.length;
        if (total > 3) {
            toast.warning('Puedes adjuntar un máximo de 3 imágenes por nota.');
            return;
        }
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

    const handleSubmit = () => {
        if (!titulo.trim() || !contenido.trim()) {
            toast.warning('Completa el título y el contenido de la nota.');
            return;
        }
        if (!saving) setConfirmSave(true);
    };

    const saveNote = async () => {
        if (saving) return;
        setConfirmSave(false);
        setSaving(true);

        const form = new FormData();
        form.append('titulo', titulo);
        form.append('contenido', contenido);
        []
            .concat(eventId)
            .filter(Boolean)
            .forEach((id) => form.append('eventos[]', String(id)));

        if (isEditing) {
            existingImages.forEach((url) =>
                form.append('keep_imagenes[]', urlToFilename(url))
            );
        }
        newFiles.forEach((file) => form.append('imagenes', file));

        try {
            abortRef.current = new AbortController();
            const base = import.meta.env.VITE_API_BASE_URL;
            const url = isEditing ? `${base}/api/notas/${nota.id}` : `${base}/api/notas`;
            const method = isEditing ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: form,
                signal: abortRef.current.signal,
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody?.error || `Error ${response.status}`);
            }

            const saved = await response.json();
            toast.success(isEditing ? 'Nota actualizada correctamente.' : 'Nota guardada correctamente.');
            onSaved(saved);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                toast.error(error.message || 'Error al guardar la nota.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-8">
            <div className="w-full max-w-4xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
                <div className="flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
                    <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {isEditing ? 'Actualizar nota' : 'Registrar nota'}
                            </p>
                            <h3 className="text-2xl font-semibold text-slate-900">
                                {isEditing ? 'Edita la información clave' : 'Captura los detalles importantes'}
                            </h3>
                            <p className="text-sm text-slate-500">
                                Esta nota quedará asociada a la visita seleccionada para que el equipo comercial pueda consultarla al instante.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700 disabled:opacity-50"
                            aria-label="Cerrar"
                            disabled={saving}
                        >
                            <FaTimes size={18} />
                        </button>
                    </header>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                            <section className="space-y-6">
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Título de la nota</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Seguimiento de visita"
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        value={titulo}
                                        onChange={(e) => setTitulo(e.target.value)}
                                        disabled={saving}
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                        Usa un título descriptivo para localizar esta información rápidamente desde la agenda.
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Contenido</label>
                                    <textarea
                                        rows={6}
                                        placeholder="Describe acuerdos, compromisos o próximos pasos acordados con el cliente."
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        value={contenido}
                                        onChange={(e) => setContenido(e.target.value)}
                                        disabled={saving}
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                        Recuerda incluir responsables y fechas para que el seguimiento sea más sencillo.
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-700">Adjuntar imágenes</h4>
                                            <p className="text-xs text-slate-500">Máximo 3 archivos en total. Formatos admitidos: JPG o PNG.</p>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                            {existingImages.length + newFiles.length}/3
                                        </span>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 cursor-pointer">
                                            <FiCamera /> Tomar foto
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={(e) => handleNewFiles(e.target.files)}
                                                disabled={saving}
                                            />
                                        </label>
                                        <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 cursor-pointer">
                                            <FiUpload /> Subir desde dispositivo
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

                                    {(existingImages.length > 0 || previews.length > 0) && (
                                        <div className="mt-4 space-y-3">
                                            {existingImages.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                                        Imágenes actuales
                                                    </p>
                                                    <div className="flex flex-wrap gap-3">
                                                        {existingImages.map((url, i) => (
                                                            <div key={i} className="relative">
                                                                <img
                                                                    src={url}
                                                                    alt={`img-${i}`}
                                                                    className="h-20 w-20 rounded-lg object-cover shadow-sm"
                                                                />
                                                                <button
                                                                    onClick={() => removeExisting(url)}
                                                                    className="absolute -top-2 -right-2 rounded-full bg-red-500 p-1 text-white shadow"
                                                                    disabled={saving}
                                                                >
                                                                    <FiTrash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {previews.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                                        Nuevos archivos
                                                    </p>
                                                    <div className="flex flex-wrap gap-3">
                                                        {previews.map((url, i) => (
                                                            <div key={i} className="relative">
                                                                <img src={url} alt={`new-${i}`} className="h-20 w-20 rounded-lg object-cover shadow-sm" />
                                                                <button
                                                                    onClick={() => removeNew(i)}
                                                                    className="absolute -top-2 -right-2 rounded-full bg-red-500 p-1 text-white shadow"
                                                                    disabled={saving}
                                                                >
                                                                    <FiTrash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>

                            <aside className="flex flex-col gap-4">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 text-sm text-slate-600 shadow-sm">
                                    <h4 className="text-sm font-semibold text-slate-700">Resumen previo</h4>
                                    <ul className="mt-3 space-y-2 text-xs">
                                        <li>
                                            <span className="font-semibold text-slate-700">Título:</span>{' '}
                                            {titulo ? titulo : 'Añade un título descriptivo.'}
                                        </li>
                                        <li>
                                            <span className="font-semibold text-slate-700">Contenido:</span>{' '}
                                            {contenido ? `${contenido.length} caracteres` : 'Describe lo hablado en la visita.'}
                                        </li>
                                        <li>
                                            <span className="font-semibold text-slate-700">Imágenes:</span>{' '}
                                            {existingImages.length + newFiles.length > 0
                                                ? `${existingImages.length + newFiles.length} archivo(s) listos`
                                                : 'Aún no hay imágenes adjuntas.'}
                                        </li>
                                    </ul>
                                    <p className="mt-3 text-xs text-slate-500">
                                        Puedes guardar y volver a editar esta nota cuando lo necesites. Las imágenes se almacenarán junto con el registro.
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <h4 className="text-sm font-semibold text-slate-700">Acciones</h4>
                                    <div className="mt-3 grid gap-2">
                                        <button
                                            onClick={handleSubmit}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <>
                                                    <InlineSpinner className="w-4 h-4 text-white" />
                                                    Guardando…
                                                </>
                                            ) : isEditing ? (
                                                'Actualizar nota'
                                            ) : (
                                                'Guardar nota'
                                            )}
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {confirmSave && (
            <ConfirmDialog
                title={isEditing ? 'Actualizar nota' : 'Guardar nota'}
                message="Se guardará la nota con el contenido y las imágenes seleccionadas."
                confirmLabel={isEditing ? 'Actualizar' : 'Guardar'}
                onConfirm={saveNote}
                onCancel={() => setConfirmSave(false)}
                loading={saving}
            />
        )}
        </>
    );
}
