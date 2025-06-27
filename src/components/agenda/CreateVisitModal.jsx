// src/components/agenda/CreateVisitModal.jsx
import React, { useState, useEffect } from 'react';
import SearchBar from './SearchBarClientsNotas';
import { FaTimes } from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function CreateVisitModal({ token, slot, onClose, onCreate }) {
    const [rawClients, setRawClients] = useState([]);       // lista tal cual viene del API
    const [sugerencias, setSugerencias] = useState([]);     // lista filtrada para el dropdown
    const [busqueda, setBusqueda] = useState('');           // término de búsqueda
    const [seleccion, setSeleccion] = useState(null);       // cliente seleccionado { codclien, razclien }
    const [descripcion, setDescripcion] = useState('');
    const [hora, setHora] = useState('09:00');
    const [notificarHora, setNotificarHora] = useState(true);
    const [fechaNoti, setFechaNoti] = useState('');

    // 1) Cargo lista de clientes "raw" al montar
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/clients`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                const lista = Array.isArray(data) ? data : data.clients || [];
                setRawClients(lista);
                setSugerencias(lista);
            })
            .catch(() => {
                setRawClients([]);
                setSugerencias([]);
            });
    }, [token]);

    // 2) Filtrar sugerencias cuando cambia `busqueda`
    const handleBusqueda = term => {
        setBusqueda(term);
        if (term.length > 1) {
            setSugerencias(
                rawClients.filter(c =>
                    c.razclien.toLowerCase().includes(term.toLowerCase()) ||
                    c.codclien.toLowerCase().includes(term.toLowerCase())
                )
            );
        } else {
            setSugerencias([]);
        }
    };

    // 3) Seleccionar un cliente del dropdown
    const handleSeleccion = cliente => {
        setSeleccion(cliente);                // { codclien, razclien, ... }
        setBusqueda(cliente.razclien);
        setSugerencias([]);
    };

    // 4) Enviar formulario
    const handleGuardar = async () => {
        if (!descripcion.trim()) {
            return alert('La descripción es obligatoria');
        }
        if (!seleccion) {
            return alert('Debes seleccionar un cliente');
        }

        // Construir fecha completa
        const fechaInicio = new Date(slot.start);
        const [h, m] = hora.split(':');
        fechaInicio.setHours(+h, +m, 0, 0);

        const payload = {
            cliente_id: seleccion.codclien,
            date: fechaInicio.toISOString(),
            description: descripcion,
            assigned_to: null
        };

        try {
            const res = await fetch(
                `${API_BASE_URL}/api/visits/client/${seleccion.codclien}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                }
            );
            const json = await res.json();
            if (!res.ok) {
                console.error('400 respuesta:', json);
                throw new Error(json.error || `HTTP ${res.status}`);
            }
            // Construyo el evento para el calendario
            const inicio2 = new Date(json.fecha);
            const newEvt = {
                ...json,
                start: inicio2,
                end: new Date(inicio2.getTime() + 60 * 60 * 1000),
                cliente_nombre: seleccion.razclien,
                descripcion: json.descripcion,
                estado: json.estado
            };
            onCreate(newEvt);

            // Notificación local si toca
            if (notificarHora) {
                const cuando = fechaNoti ? new Date(fechaNoti) : inicio2;
                const ms = cuando.getTime() - Date.now();
                if (Notification.permission === 'granted' && ms > 0 && ms < 86400000) {
                    setTimeout(() => {
                        new Notification('📅 Recordatorio de visita', {
                            body: descripcion
                        });
                    }, ms);
                }
            }

            onClose();
        } catch (err) {
            console.error('Error creando visita:', err);
            alert('No se pudo crear la visita');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
                {/* Botón cerrar */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-600 hover:text-gray-800"
                    aria-label="Cerrar"
                >
                    <FaTimes size={20} />
                </button>

                <h2 className="text-2xl font-bold text-center mb-6">Nueva visita</h2>

                {/* Descripción */}
                <label className="block mb-1 font-medium">Descripción</label>
                <input
                    type="text"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-4"
                    placeholder="¿Qué visita vas a agendar?"
                />

                {/* Hora */}
                <label className="block mb-1 font-medium">Hora</label>
                <input
                    type="time"
                    value={hora}
                    onChange={e => setHora(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-4"
                />

                {/* Buscador de clientes */}
                <label className="block mb-1 font-medium">Cliente</label>
                <SearchBar
                    searchTerm={busqueda}
                    setSearchTerm={handleBusqueda}
                    suggestions={sugerencias}
                    setSuggestions={setSugerencias}
                    handleSuggestionClick={handleSeleccion}
                    handleSearchEnter={() => { }}
                />

                {/* Badge con cliente seleccionado */}
                {seleccion && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded flex justify-between items-center">
                        <span>
                            Cliente: <strong>{seleccion.razclien}</strong>
                        </span>
                        <button
                            onClick={() => {
                                setSeleccion(null);
                                setBusqueda('');
                            }}
                            className="text-blue-600 underline text-sm"
                        >
                            quitar
                        </button>
                    </div>
                )}

                {/* Notificar */}
                <label className="flex items-center mt-4 mb-1">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={notificarHora}
                        onChange={e => setNotificarHora(e.target.checked)}
                    />
                    Notificar a la hora
                </label>
                {notificarHora && (
                    <input
                        type="datetime-local"
                        value={fechaNoti}
                        onChange={e => setFechaNoti(e.target.value)}
                        className="w-full border rounded px-3 py-2 mb-4"
                    />
                )}

                {/* Botones */}
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleGuardar}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Crear visita
                    </button>
                </div>
            </div>
        </div>
    );
}
