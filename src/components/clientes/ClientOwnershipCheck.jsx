import React, { useEffect, useState } from 'react';
import {
    FiAlertTriangle,
    FiCheckCircle,
    FiLoader,
    FiMapPin,
    FiSearch,
    FiShield,
    FiUser,
    FiX,
} from 'react-icons/fi';
import { useAuthContext } from '../../Auth/AuthContext';

const STATUS_CONFIG = {
    OWN: {
        icon: FiCheckCircle,
        title: 'Cliente de tu cartera',
        description: 'Este cliente ya está asignado a ti.',
        classes: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
        badge: 'bg-emerald-100 text-emerald-800',
    },
    OTHER: {
        icon: FiAlertTriangle,
        title: 'Cliente asignado a otro comercial',
        description: 'Evita realizar la visita sin coordinarlo previamente.',
        classes: 'border-rose-200 bg-rose-50/80 text-rose-950',
        badge: 'bg-rose-100 text-rose-800',
    },
    ASSIGNED: {
        icon: FiUser,
        title: 'Cliente asignado',
        description: 'Este cliente ya tiene una cartera comercial asignada.',
        classes: 'border-sky-200 bg-sky-50/80 text-sky-950',
        badge: 'bg-sky-100 text-sky-800',
    },
    UNASSIGNED: {
        icon: FiAlertTriangle,
        title: 'Cliente existente sin comercial asignado',
        description: 'El cliente existe, pero actualmente no tiene comercial asignado.',
        classes: 'border-amber-200 bg-amber-50/80 text-amber-950',
        badge: 'bg-amber-100 text-amber-800',
    },
};

export default function ClientOwnershipCheck({ open, onClose, onOpenOwnClient }) {
    const { token } = useAuthContext();
    const [query, setQuery] = useState('');
    const [localidad, setLocalidad] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setLocalidad('');
            setResults(null);
            setError('');
            setLoading(false);
        }
    }, [open]);

    if (!open) return null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        const cleanQuery = query.trim();

        if (cleanQuery.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length < 3) {
            setError('Escribe al menos 3 caracteres del nombre, CIF/NIF o código del cliente.');
            setResults(null);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams({ query: cleanQuery, limit: '8' });
            if (localidad.trim()) params.set('localidad', localidad.trim());

            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/clients/check-existing?${params.toString()}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || 'No se ha podido comprobar el cliente.');
            }

            setResults(Array.isArray(data.matches) ? data.matches : []);
        } catch (requestError) {
            console.error(requestError);
            setError(requestError.message || 'No se ha podido comprobar el cliente.');
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-ownership-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose?.();
            }}
        >
            <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] shadow-2xl sm:max-h-[88dvh] sm:rounded-3xl">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--cjm-border)] px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--cjm-primary-deep)]">
                            <FiShield aria-hidden="true" />
                            Control de cartera
                        </div>
                        <h2 id="client-ownership-title" className="text-xl font-bold app-text sm:text-2xl">
                            Comprobar cliente antes de visitar
                        </h2>
                        <p className="cjm-muted mt-1 text-sm">
                            Busca en toda la base para saber si el cliente ya pertenece a otro comercial.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="cjm-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        aria-label="Cerrar comprobación"
                    >
                        <FiX className="text-lg" aria-hidden="true" />
                    </button>
                </div>

                <div className="overflow-y-auto px-4 py-5 sm:px-6">
                    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-4">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_auto] md:items-end">
                            <label className="block min-w-0">
                                <span className="cjm-control-label">Nombre, CIF/NIF o código</span>
                                <div className="relative">
                                    <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" aria-hidden="true" />
                                    <input
                                        autoFocus
                                        type="search"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Ej. Decoraciones Martínez"
                                        className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-3"
                                        autoComplete="off"
                                    />
                                </div>
                            </label>

                            <label className="block min-w-0">
                                <span className="cjm-control-label">Localidad (opcional)</span>
                                <div className="relative">
                                    <FiMapPin className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" aria-hidden="true" />
                                    <input
                                        type="search"
                                        value={localidad}
                                        onChange={(event) => setLocalidad(event.target.value)}
                                        placeholder="Ej. Córdoba"
                                        className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-3"
                                        autoComplete="off"
                                    />
                                </div>
                            </label>

                            <button type="submit" disabled={loading} className="cjm-primary-button min-h-12 w-full rounded-xl px-5 md:w-auto">
                                {loading ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
                                Comprobar
                            </button>
                        </div>

                        <p className="cjm-muted mt-3 text-xs">
                            Para proteger las carteras, esta consulta no muestra teléfonos, emails, facturación, tarifas ni notas de clientes ajenos.
                        </p>
                    </form>

                    {error && (
                        <div className="cjm-alert cjm-alert-error mt-4" role="alert">
                            {error}
                        </div>
                    )}

                    {results !== null && !loading && (
                        <div className="mt-5 space-y-3" aria-live="polite">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-bold app-text">Resultado de la comprobación</h3>
                                <span className="cjm-badge">{results.length} coincidencia{results.length === 1 ? '' : 's'}</span>
                            </div>

                            {results.length === 0 ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950">
                                    <div className="flex items-start gap-3">
                                        <FiCheckCircle className="mt-0.5 shrink-0 text-xl" aria-hidden="true" />
                                        <div>
                                            <strong className="block">No hemos encontrado un cliente activo con esos datos.</strong>
                                            <p className="mt-1 text-sm opacity-80">
                                                Puedes continuar con la visita, aunque conviene comprobar que el nombre esté escrito correctamente.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                results.map((client, index) => {
                                    const config = STATUS_CONFIG[client.ownership] || STATUS_CONFIG.ASSIGNED;
                                    const StatusIcon = config.icon;

                                    return (
                                        <article
                                            key={`${client.razclien}-${client.localidad}-${index}`}
                                            className={`rounded-2xl border p-4 ${config.classes}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <StatusIcon className="mt-0.5 shrink-0 text-xl" aria-hidden="true" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <h4 className="break-words text-base font-bold">{client.razclien}</h4>
                                                            {(client.localidad || client.codpais) && (
                                                                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm opacity-80">
                                                                    <FiMapPin aria-hidden="true" />
                                                                    {[client.localidad, client.codpais].filter(Boolean).join(' · ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${config.badge}`}>
                                                            {config.title}
                                                        </span>
                                                    </div>

                                                    <p className="mt-3 text-sm font-medium">{config.description}</p>

                                                    {client.commercialName && client.ownership !== 'UNASSIGNED' && (
                                                        <p className="mt-2 text-sm">
                                                            Comercial: <strong>{client.commercialName}</strong>
                                                        </p>
                                                    )}

                                                    {client.ownership === 'OWN' && client.openClientCode && (
                                                        <button
                                                            type="button"
                                                            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-current px-3 py-2 text-sm font-bold"
                                                            onClick={() => onOpenOwnClient?.(client.openClientCode)}
                                                        >
                                                            <FiUser aria-hidden="true" />
                                                            Abrir mi cliente
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
