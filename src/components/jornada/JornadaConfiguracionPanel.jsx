import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import {
    loadTeamJornadaConfigurations,
    saveJornadaConfiguration,
} from '../../services/jornadaClient';

const WEEKDAYS = [
    [1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'],
    [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo'],
];

const todayKey = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const normalizePlan = (plan) => {
    const source = Array.isArray(plan) ? plan : [];
    return WEEKDAYS.map(([weekday]) => {
        const found = source.find((item) => Number(item.weekday) === weekday);
        const working = found ? Boolean(found.working) : weekday <= 5;
        return {
            weekday,
            working,
            targetMinutes: found ? Number(found.targetMinutes || 0) : (weekday <= 5 ? 480 : 0),
            startTime: found?.startTime || (weekday <= 5 ? '07:00' : ''),
            endTime: found?.endTime || (weekday <= 5 ? '15:00' : ''),
        };
    });
};

const personLabel = (person) => [person.nombre, person.apellido1, person.apellido2].filter(Boolean).join(' ') || person.username;

export default function JornadaConfiguracionPanel({ token, onChanged }) {
    const [people, setPeople] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [effectiveFrom, setEffectiveFrom] = useState(todayKey());
    const [defaultMode, setDefaultMode] = useState('presencial');
    const [scheduleType, setScheduleType] = useState('fijo');
    const [notes, setNotes] = useState('');
    const [plan, setPlan] = useState(() => normalizePlan([]));

    const selected = useMemo(
        () => people.find((person) => String(person.id) === String(selectedId)) || null,
        [people, selectedId]
    );

    const load = async () => {
        setLoading(true);
        try {
            const data = await loadTeamJornadaConfigurations(token);
            const list = data.people || [];
            setPeople(list);
            if (!selectedId && list[0]?.id) setSelectedId(String(list[0].id));
        } catch (error) {
            toast.error(error.message || 'No se pudieron cargar los horarios.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

    useEffect(() => {
        if (!selected) return;
        setDefaultMode(selected.modalidad_predeterminada || 'presencial');
        setScheduleType(selected.tipo_horario || 'fijo');
        setNotes(selected.observaciones || '');
        setPlan(normalizePlan(selected.plan_semanal));
    }, [selected]);

    const updateDay = (weekday, patch) => {
        setPlan((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
    };

    const save = async (event) => {
        event.preventDefault();
        if (!selectedId) return;
        setSaving(true);
        try {
            await saveJornadaConfiguration(token, selectedId, {
                effectiveFrom,
                modalidadPredeterminada: defaultMode,
                tipoHorario: scheduleType,
                planSemanal: plan.map((day) => ({
                    ...day,
                    targetMinutes: day.working ? Math.max(0, Number(day.targetMinutes) || 0) : 0,
                    startTime: day.working ? (day.startTime || null) : null,
                    endTime: day.working ? (day.endTime || null) : null,
                })),
                observaciones: notes.trim() || null,
            });
            toast.success('Nueva versión del horario guardada sin alterar el histórico.');
            await load();
            await onChanged?.();
        } catch (error) {
            toast.error(error.message || 'No se pudo guardar el horario.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900"><CalendarClock size={18} /> Horarios y jornada prevista</h2>
                    <p className="mt-1 text-sm text-slate-500">Cada cambio crea una versión nueva con fecha de entrada en vigor; el histórico no se sobrescribe.</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="cjm-icon-button" aria-label="Actualizar horarios">
                    <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <form onSubmit={save} className="mt-5 space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-sm text-slate-700">
                        <span className="mb-1 block font-medium">Trabajador</span>
                        <select className="cjm-input w-full" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
                            <option value="">Selecciona…</option>
                            {people.map((person) => <option key={person.id} value={person.id}>{personLabel(person)} · {person.role}</option>)}
                        </select>
                    </label>
                    <label className="text-sm text-slate-700">
                        <span className="mb-1 block font-medium">En vigor desde</span>
                        <input type="date" className="cjm-input w-full" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
                    </label>
                    <label className="text-sm text-slate-700">
                        <span className="mb-1 block font-medium">Modalidad habitual</span>
                        <select className="cjm-input w-full" value={defaultMode} onChange={(e) => setDefaultMode(e.target.value)}>
                            <option value="presencial">Presencial</option>
                            <option value="teletrabajo">Teletrabajo</option>
                            <option value="movilidad">Movilidad / comercial</option>
                        </select>
                    </label>
                    <label className="text-sm text-slate-700">
                        <span className="mb-1 block font-medium">Tipo de horario</span>
                        <select className="cjm-input w-full" value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
                            <option value="fijo">Fijo</option>
                            <option value="flexible">Flexible</option>
                            <option value="movilidad">Movilidad</option>
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-[760px] w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-600">
                            <tr><th className="p-3">Día</th><th className="p-3">Laborable</th><th className="p-3">Objetivo (min)</th><th className="p-3">Inicio orientativo</th><th className="p-3">Fin orientativo</th></tr>
                        </thead>
                        <tbody>
                            {plan.map((day) => {
                                const label = WEEKDAYS.find(([value]) => value === day.weekday)?.[1];
                                return (
                                    <tr key={day.weekday} className="border-t border-slate-100">
                                        <td className="p-3 font-medium text-slate-800">{label}</td>
                                        <td className="p-3"><input type="checkbox" checked={day.working} onChange={(e) => updateDay(day.weekday, { working: e.target.checked })} /></td>
                                        <td className="p-3"><input type="number" min="0" max="1440" className="cjm-input w-28" disabled={!day.working} value={day.targetMinutes} onChange={(e) => updateDay(day.weekday, { targetMinutes: e.target.value })} /></td>
                                        <td className="p-3"><input type="time" className="cjm-input" disabled={!day.working} value={day.startTime || ''} onChange={(e) => updateDay(day.weekday, { startTime: e.target.value })} /></td>
                                        <td className="p-3"><input type="time" className="cjm-input" disabled={!day.working} value={day.endTime || ''} onChange={(e) => updateDay(day.weekday, { endTime: e.target.value })} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <label className="block text-sm text-slate-700">
                    <span className="mb-1 block font-medium">Observaciones contractuales / de organización</span>
                    <textarea className="cjm-input min-h-20 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} placeholder="Ej.: horario flexible con presencia obligatoria de 09:00 a 13:00." />
                </label>

                <div className="flex justify-end">
                    <button type="submit" disabled={saving || !selectedId} className="cjm-primary-button"><Save size={16} /> {saving ? 'Guardando…' : 'Guardar nueva versión'}</button>
                </div>
            </form>
        </section>
    );
}
