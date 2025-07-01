import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function GenericEventModal({ slot, onClose, onSave }) {
    // Pre-llenado si viene slot
    const defaultDateTime = slot?.start
        ? new Date(slot.start).toISOString().slice(0, 16)
        : '';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateTime, setDateTime] = useState(defaultDateTime);

    const handleSave = () => {
        if (!title.trim()) return alert('El título es obligatorio');
        if (!dateTime) return alert('La fecha y hora son obligatorias');
        const start = new Date(dateTime);
        onSave({
            id: `evt-${Date.now()}`,               // id temporal
            title,
            descripcion: description,
            start,
            end: new Date(start.getTime() + 3600000),
            type: 'event',
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 relative overflow-y-auto max-h-[90vh]">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-600 hover:text-gray-800"
                    aria-label="Cerrar"
                >
                    <FaTimes size={20} />
                </button>
                <h2 className="text-2xl font-bold mb-4">➕ Nuevo evento</h2>
                <label className="block mb-1 font-medium">Título</label>
                <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-4"
                    placeholder="Nombre del evento"
                />
                <label className="block mb-1 font-medium">Descripción</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-4"
                    rows={3}
                    placeholder="Algo sobre este evento…"
                />
                <label className="block mb-1 font-medium">Fecha y hora</label>
                <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={e => setDateTime(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-6"
                />
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                        Crear evento
                    </button>
                </div>
            </div>
        </div>
    );
}
