// src/components/agenda/CreateVisitModal.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import SearchBar from './SearchBarClientsNotas';
import { FaTimes } from 'react-icons/fa';
import { format, formatDistanceToNow } from 'date-fns';
import es from 'date-fns/locale/es';
import InlineSpinner from '../common/InlineSpinner.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function CreateVisitModal({ token, slot, onClose, onCreate }) {
    const [rawClients, setRawClients] = useState([]);       // lista tal cual viene del API
    const [sugerencias, setSugerencias] = useState([]);     // lista filtrada para el dropdown
    const [busqueda, setBusqueda] = useState('');           // término de búsqueda
    const [seleccion, setSeleccion] = useState(null);       // cliente seleccionado { codclien, razclien }
    const [descripcion, setDescripcion] = useState('');
    const [hora, setHora] = useState(() => {
        if (slot?.start) {
            const start = new Date(slot.start);
            return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        }
        return '09:00';
    });
    const [notificarHora, setNotificarHora] = useState(true);
    const [fechaNoti, setFechaNoti] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const descRef = useRef(null);
    const formSectionRef = useRef(null);

    useEffect(() => {
        if (slot?.start) {
            const start = new Date(slot.start);
            setHora(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
        }
    }, [slot]);

    // Foco inicial en la descripción al abrir
    useEffect(() => {
        const t = setTimeout(() => {
            descRef.current?.focus();
        }, 0);
        return () => clearTimeout(t);
    }, []);

    // 1) Cargo lista de clientes "raw" al montar
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/clients`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((data) => {
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
    const handleBusqueda = (term) => {
        setBusqueda(term);
        if (term.length > 1) {
            setSugerencias(
                rawClients.filter(
                    (c) =>
                        c.razclien.toLowerCase().includes(term.toLowerCase()) ||
                        c.codclien.toLowerCase().includes(term.toLowerCase())
                )
            );
        } else {
            setSugerencias([]);
        }
    };

    // 3) Seleccionar un cliente del dropdown
    const handleSeleccion = (cliente) => {
        setSeleccion(cliente); // { codclien, razclien, ... }
        setBusqueda(cliente.razclien);
        setSugerencias([]);
    };

    // 4) Enviar formulario
    const handleGuardar = async () => {
        if (saving) return;
        setFormError('');

        if (!descripcion.trim()) {
            setFormError('La descripción es obligatoria');
            return;
        }
        if (!seleccion) {
            setFormError('Debes seleccionar un cliente');
            return;
        }

        // Construir fecha completa
        const fechaInicio = new Date(slot.start);
        const [h, m] = hora.split(':');
        fechaInicio.setHours(+h, +m, 0, 0);

        // Validaciones de recordatorio
        if (notificarHora && fechaNoti) {
            const noti = new Date(fechaNoti);
            if (isNaN(noti)) {
                setFormError('La fecha del recordatorio no es válida.');
                return;
            }
            if (noti < new Date()) {
                setFormError('El recordatorio debe ser en el futuro.');
                return;
            }
            if (noti < fechaInicio) {
                setFormError('El recordatorio no puede ser antes del inicio de la visita.');
                return;
            }
        }

        const payload = {
            cliente_id: seleccion.codclien,
            date: fechaInicio.toISOString(),
            description: descripcion,
            assigned_to: null
        };

        try {
            setSaving(true);

            // Solicitar permiso de notificaciones si aplica
            if (notificarHora && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                try { await Notification.requestPermission(); } catch { /* no-op */ }
            }

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
            let json = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }
            if (!res.ok) {
                console.error('400 respuesta:', json);
                throw new Error(json?.error || `HTTP ${res.status}`);
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
            setFormError('No se pudo crear la visita');
        } finally {
            setSaving(false);
        }
    };

    const slotMeta = useMemo(() => {
        if (!slot?.start) return null;
        const start = new Date(slot.start);
        return {
            date: format(start, "EEEE d 'de' MMMM", { locale: es }),
            time: format(start, 'HH:mm', { locale: es }),
            relative: formatDistanceToNow(start, { locale: es, addSuffix: true })
        };
    }, [slot]);

    const canSave = !!(seleccion && descripcion.trim() && !saving);

    const onKeyDownForm = (e) => {
        // Enviar con Enter salvo en textareas o pickers donde no aplica
        if (e.key === 'Enter' && !saving) {
            const tag = document.activeElement?.tagName?.toLowerCase();
            if (tag === 'textarea') return;
            e.preventDefault();
            handleGuardar();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-visit-title"
        >
            <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:max-h-[calc(100vh-4rem)]">
                <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Planificar visita
                        </p>
                        <h2 id="create-visit-title" className="text-2xl font-semibold text-slate-900">
                            Bloque de agenda personalizado
                        </h2>
                        {slotMeta && (
                            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                                    📅 {slotMeta.date}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                                    🕒 {slotMeta.time}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                                    ⏳ {slotMeta.relative}
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="self-end rounded-full p-2 text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
                        aria-label="Cerrar"
                        disabled={saving}
                        title="Cerrar"
                    >
                        <FaTimes size={20} />
                    </button>
                </header>

                <div
                    className="flex-1 overflow-y-auto px-5 py-6 sm:px-6"
                    onKeyDown={onKeyDownForm}
                    ref={formSectionRef}
                >
                    <div className="grid gap-6 lg:grid-cols-[1.6fr_minmax(220px,1fr)]">
                        <section className="space-y-6">
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-5">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                                    1. Describe la visita
                                </h3>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                <input
                                    type="text"
                                    value={descripcion}
                                    onChange={(e) => setDescripcion(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    placeholder="¿Qué visita vas a agendar?"
                                    disabled={saving}
                                    ref={descRef}
                                />

                                <label className="block text-sm font-medium text-slate-700 mb-1 mt-4">Hora prevista</label>
                                <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                                    <input
                                        type="time"
                                        value={hora}
                                        onChange={(e) => setHora(e.target.value)}
                                        className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        disabled={saving}
                                    />
                                    <p className="text-sm text-slate-500">
                                        Ajusta la hora exacta en la que debe comenzar la visita. El calendario reservará una hora completa a partir de ese momento.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                                    2. Selecciona al cliente
                                </h3>
                                <p className="text-sm text-slate-500 mb-3">
                                    Busca por nombre o código y selecciona el contacto correcto para asociarlo a la visita.
                                </p>
                                <SearchBar
                                    searchTerm={busqueda}
                                    setSearchTerm={handleBusqueda}
                                    suggestions={sugerencias}
                                    setSuggestions={setSugerencias}
                                    handleSuggestionClick={handleSeleccion}
                                    handleSearchEnter={() => { }}
                                    disabled={saving}
                                />

                                {seleccion ? (
                                    <div className="mt-4 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                                        <div className="flex flex-col">
                                            <span className="font-semibold">{seleccion.razclien}</span>
                                            <span className="text-xs text-indigo-600/80">Código {seleccion.codclien}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSeleccion(null);
                                                setBusqueda('');
                                                setSugerencias(rawClients);
                                            }}
                                            className="text-xs font-semibold uppercase tracking-wide text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                                            disabled={saving}
                                            title="Cambiar cliente seleccionado"
                                        >
                                            Cambiar
                                        </button>
                                    </div>
                                ) : (
                                    <p className="mt-4 text-sm text-slate-400">
                                        Ningún cliente seleccionado todavía.
                                    </p>
                                )}
                            </div>

                            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                                    3. Define recordatorios
                                </h3>
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={notificarHora}
                                        onChange={(e) => setNotificarHora(e.target.checked)}
                                        disabled={saving}
                                    />
                                    Quiero recibir un aviso personalizado
                                </label>
                                {notificarHora && (
                                    <div className="mt-3 grid gap-2">
                                        <input
                                            type="datetime-local"
                                            value={fechaNoti}
                                            onChange={(e) => setFechaNoti(e.target.value)}
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                            disabled={saving}
                                        />
                                        <p className="text-xs text-slate-500">
                                            El aviso aparecerá como notificación en tu navegador y se sincronizará con la agenda del día.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {formError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {formError}
                                </div>
                            )}
                        </section>

                        <aside className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 text-sm text-slate-600 shadow-sm">
                                <h4 className="text-sm font-semibold text-indigo-700">Resumen rápido</h4>
                                <ul className="mt-3 space-y-2">
                                    <li className="flex items-start gap-2">
                                        <span className="mt-0.5">📝</span>
                                        <div>
                                            <p className="font-medium text-slate-800">Descripción</p>
                                            <p className="text-xs text-slate-500">
                                                {descripcion ? descripcion : 'Añade un objetivo claro para la visita.'}
                                            </p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-0.5">👤</span>
                                        <div>
                                            <p className="font-medium text-slate-800">Cliente</p>
                                            <p className="text-xs text-slate-500">
                                                {seleccion ? `${seleccion.razclien} (${seleccion.codclien})` : 'Selecciona a quién visitarás.'}
                                            </p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="mt-0.5">🔔</span>
                                        <div>
                                            <p className="font-medium text-slate-800">Recordatorio</p>
                                            <p className="text-xs text-slate-500">
                                                {notificarHora
                                                    ? fechaNoti
                                                        ? `Notificaremos el ${format(new Date(fechaNoti), "d 'de' MMM yyyy, HH:mm", { locale: es })}`
                                                        : 'Se enviará un aviso en el momento de la visita.'
                                                    : 'Los recordatorios están desactivados.'}
                                            </p>
                                        </div>
                                    </li>
                                </ul>
                            </div>

                            <div className="mt-auto flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm">
                                <p className="text-sm text-slate-500">
                                    Revisa los campos antes de crear la visita. Podrás editarla más adelante desde los detalles de la agenda.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={handleGuardar}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={!canSave}
                                    >
                                        {saving ? (
                                            <>
                                                <InlineSpinner className="w-4 h-4 text-white" />
                                                Creando visita…
                                            </>
                                        ) : (
                                            'Guardar y bloquear horario'
                                        )}
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
    );
}
