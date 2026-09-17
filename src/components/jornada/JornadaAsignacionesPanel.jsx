import { useEffect, useMemo, useState } from 'react';
import {
    CheckCheck,
    RefreshCw,
    Search,
    UserCheck,
    UserX,
    UsersRound,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
    loadTeamJornadaAssignments,
    saveJornadaAssignment,
} from '../../services/jornadaClient';

const MADRID_ZONE = 'Europe/Madrid';

const todayKey = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());

const personLabel = (person) => (
    [person.nombre, person.apellido1, person.apellido2].filter(Boolean).join(' ')
    || person.username
    || `Usuario ${person.id}`
);

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function JornadaAsignacionesPanel({ token, onChanged }) {
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [excludeId, setExcludeId] = useState(null);
    const [excludeReason, setExcludeReason] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await loadTeamJornadaAssignments(token);
            setPeople(data.people || []);
        } catch (error) {
            toast.error(error.message || 'No se pudo cargar la clasificación de usuarios.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const included = people.filter((item) => item.requiere_registro).length;
    const excluded = people.filter((item) => !item.requiere_registro).length;
    const pending = people.filter((item) => !item.explicit).length;

    const filtered = useMemo(() => {
        const needle = normalize(query.trim());
        if (!needle) return people;
        return people.filter((person) => normalize([
            personLabel(person),
            person.username,
            person.role,
            person.departamento,
        ].filter(Boolean).join(' ')).includes(needle));
    }, [people, query]);

    const refreshAll = async () => {
        await load();
        await onChanged?.();
    };

    const saveWorker = async (person) => {
        setSavingId(person.id);
        try {
            const data = await saveJornadaAssignment(token, person.id, {
                effectiveFrom: todayKey(),
                esTrabajador: true,
                requiereRegistro: true,
                motivo: null,
            });
            if (data.assignment?.no_change) {
                toast.info(`${personLabel(person)} ya estaba confirmado como trabajador.`);
            } else {
                toast.success(`${personLabel(person)} confirmado: debe registrar jornada.`);
            }
            setExcludeId(null);
            setExcludeReason('');
            await refreshAll();
        } catch (error) {
            toast.error(error.message || 'No se pudo guardar la clasificación.');
        } finally {
            setSavingId(null);
        }
    };

    const openExclude = (person) => {
        setExcludeId(person.id);
        setExcludeReason(person.motivo && !person.requiere_registro ? person.motivo : '');
    };

    const saveExcluded = async (person) => {
        const reason = excludeReason.trim();
        if (reason.length < 5) {
            toast.warning('Indica brevemente por qué esta cuenta no corresponde a una persona trabajadora.');
            return;
        }

        setSavingId(person.id);
        try {
            const data = await saveJornadaAssignment(token, person.id, {
                effectiveFrom: todayKey(),
                esTrabajador: false,
                requiereRegistro: false,
                motivo: reason,
                autoAdjustExclusion: true,
            });
            const assignment = data.assignment || {};
            if (assignment.effective_from_adjusted) {
                toast.success(
                    `${personLabel(person)} excluido desde ${String(assignment.effective_from).slice(0, 10)} para conservar sus fichajes anteriores.`
                );
            } else if (assignment.no_change) {
                toast.info(`${personLabel(person)} ya estaba excluido.`);
            } else {
                toast.success(`${personLabel(person)} marcado como cuenta no laboral.`);
            }
            setExcludeId(null);
            setExcludeReason('');
            await refreshAll();
        } catch (error) {
            const suggested = error.details?.suggestedEffectiveFrom;
            toast.error(
                suggested
                    ? `${error.message} Fecha sugerida: ${suggested}.`
                    : (error.message || 'No se pudo excluir la cuenta.')
            );
        } finally {
            setSavingId(null);
        }
    };

    const confirmAllPendingWorkers = async () => {
        const pendingPeople = people.filter((person) => !person.explicit);
        if (!pendingPeople.length) {
            toast.info('No hay usuarios pendientes de clasificar.');
            return;
        }

        setBulkSaving(true);
        let ok = 0;
        const failures = [];
        for (const person of pendingPeople) {
            try {
                await saveJornadaAssignment(token, person.id, {
                    effectiveFrom: todayKey(),
                    esTrabajador: true,
                    requiereRegistro: true,
                    motivo: null,
                });
                ok += 1;
            } catch (error) {
                failures.push(`${personLabel(person)}: ${error.message || 'error'}`);
            }
        }

        if (ok) toast.success(`${ok} usuario(s) confirmados como trabajadores sujetos al registro.`);
        if (failures.length) toast.error(`No se pudieron clasificar ${failures.length} usuario(s). Revisa la consola del servidor.`);
        setBulkSaving(false);
        await refreshAll();
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                        <UsersRound size={18} /> Usuarios y trabajadores
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">
                        Confirma quién debe fichar y excluye únicamente las cuentas que no correspondan a una persona trabajadora.
                        El histórico anterior nunca se elimina.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={confirmAllPendingWorkers}
                        disabled={bulkSaving || loading || pending === 0}
                        className="cjm-secondary-button"
                    >
                        <CheckCheck size={16} />
                        {bulkSaving ? 'Confirmando…' : `Confirmar pendientes como trabajadores (${pending})`}
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="cjm-icon-button"
                        aria-label="Actualizar clasificación"
                    >
                        <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Deben fichar</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-900">{included}</p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3">
                    <p className="text-xs text-slate-600">No trabajadores</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{excluded}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-xs text-amber-700">Pendientes de confirmar</p>
                    <p className="mt-1 text-xl font-semibold text-amber-900">{pending}</p>
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                Si una cuenta tiene fichajes y la marcas como <strong>No trabajador</strong>, el sistema aplicará la exclusión desde el día posterior al último fichaje cuando sea necesario. Así no tendrás que calcular la fecha manualmente y se conserva toda la trazabilidad.
            </div>

            <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por nombre, usuario, departamento o rol…"
                    className="cjm-input w-full pl-10"
                />
            </div>

            <div className="mt-4 space-y-2">
                {filtered.map((person) => {
                    const busy = savingId === person.id;
                    const isExcluded = !person.requiere_registro;
                    const isPending = !person.explicit;
                    const excluding = excludeId === person.id;

                    return (
                        <div key={person.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate font-semibold text-slate-900">{personLabel(person)}</p>
                                        {isPending && (
                                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pendiente</span>
                                        )}
                                        {!isPending && !isExcluded && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                                <UserCheck size={13} /> Ficha
                                            </span>
                                        )}
                                        {!isPending && isExcluded && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                <UserX size={13} /> No trabajador
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {[person.username, person.role, person.departamento].filter(Boolean).join(' · ')}
                                    </p>
                                    {person.last_event_date && (
                                        <p className="mt-1 text-xs text-slate-500">Último fichaje: {person.last_event_date}</p>
                                    )}
                                    {!isPending && isExcluded && person.motivo && (
                                        <p className="mt-1 text-xs text-slate-500">Motivo: {person.motivo}</p>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={busy || bulkSaving}
                                        onClick={() => saveWorker(person)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                            !isPending && !isExcluded
                                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                                        }`}
                                    >
                                        <UserCheck size={15} /> Trabajador · ficha
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || bulkSaving}
                                        onClick={() => openExclude(person)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                            !isPending && isExcluded
                                                ? 'border-slate-400 bg-slate-200 text-slate-900'
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        <UserX size={15} /> No trabajador
                                    </button>
                                </div>
                            </div>

                            {excluding && (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Excluir a {personLabel(person)}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Indica el motivo real. Si tiene fichajes recientes, la fecha de exclusión se ajustará automáticamente para conservarlos.
                                    </p>
                                    <textarea
                                        value={excludeReason}
                                        onChange={(event) => setExcludeReason(event.target.value)}
                                        className="cjm-input mt-3 min-h-20 w-full"
                                        maxLength={1000}
                                        placeholder="Ej.: cuenta técnica de integración sin relación laboral."
                                        autoFocus
                                    />
                                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                                        <button
                                            type="button"
                                            className="cjm-secondary-button"
                                            onClick={() => {
                                                setExcludeId(null);
                                                setExcludeReason('');
                                            }}
                                            disabled={busy}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="cjm-primary-button"
                                            onClick={() => saveExcluded(person)}
                                            disabled={busy || excludeReason.trim().length < 5}
                                        >
                                            <UserX size={16} /> {busy ? 'Guardando…' : 'Confirmar exclusión'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {!loading && filtered.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                        No hay usuarios que coincidan con la búsqueda.
                    </div>
                )}
            </div>
        </section>
    );
}
