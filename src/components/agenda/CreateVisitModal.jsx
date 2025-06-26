import React, { useState, useEffect } from 'react';
import SearchBar from './SearchBarClientsNotas';

export default function CreateVisitModal({ token, slot, onClose, onCreate }) {
    const [clientes, setClientes] = useState([]);
    const [cliente, setCliente] = useState(null);
    const [hora, setHora] = useState('09:00');
    const [desc, setDesc] = useState('');
    const [notifAtTime, setNotifAtTime] = useState(true);
    const [customNotif, setCustomNotif] = useState('');

    // Carga inicial de clientes (para SearchBar)
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : data.clients;
                setClientes(list.map(c => ({ value: c.codclien, label: c.razclien })));
            })
            .catch(() => setClientes([]));
    }, [token]);

    const handleSave = () => {
        if (!desc.trim() || !cliente) {
            return alert('Descripción y cliente son requeridos');
        }
        // Construye fecha de inicio
        const [h, m] = hora.split(':');
        const start = new Date(slot.start);
        start.setHours(+h, +m, 0, 0);

        // POST visita
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/client/0`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                cliente_id: cliente.value,
                date: start.toISOString(),
                description: desc
            })
        })
            .then(r => r.json())
            .then(d => {
                const start2 = new Date(d.fecha);
                const newEvt = {
                    ...d,
                    start: start2,
                    end: new Date(start2.getTime() + 3600000),
                    cliente_nombre: cliente.label,
                    descripcion: d.descripcion,
                    estado: d.estado || 'pendiente',
                    codclien: cliente.value
                };
                onCreate(newEvt);

                // Si notificamos a hora del evento o personalizados
                if (notifAtTime) {
                    const when = customNotif ? new Date(customNotif) : start2;
                    const ms = when.getTime() - Date.now();
                    if (Notification.permission === 'granted' && ms > 0 && ms < 86400000) {
                        setTimeout(() => {
                            new Notification('📅 Recordatorio de visita', {
                                body: desc
                            });
                        }, ms);
                    }
                }
            })
            .catch(() => alert('Error creando visita'));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4">
                <h2 className="text-xl font-bold mb-4">Nueva visita</h2>

                <input
                    type="text"
                    placeholder="Descripción"
                    className="w-full mb-3 border rounded px-3 py-2"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                />

                <input
                    type="time"
                    className="w-full mb-3 border rounded px-3 py-2"
                    value={hora}
                    onChange={e => setHora(e.target.value)}
                />

                <SearchBar
                    searchTerm=""
                    setSearchTerm={() => { }}
                    suggestions={clientes}
                    setSuggestions={() => { }}
                    handleSuggestionClick={c => setCliente(c)}
                />

                <label className="flex items-center my-3">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={notifAtTime}
                        onChange={e => setNotifAtTime(e.target.checked)}
                    />
                    Notificar a la hora
                </label>

                {notifAtTime && (
                    <input
                        type="datetime-local"
                        className="w-full mb-3 border rounded px-3 py-2"
                        value={customNotif}
                        onChange={e => setCustomNotif(e.target.value)}
                    />
                )}

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                        Crear
                    </button>
                </div>
            </div>
        </div>
    );
}
