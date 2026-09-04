import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus2, ShieldAlert } from 'lucide-react';
import { COMPANY_WORK_SCHEDULE, isWeekendDate, validateVacationEndpoints } from '../../utils/vacationWorkSchedule';

const emptyForm = { empleado_id: '', fecha_inicio: '', fecha_fin: '', motivo: '', estado_inicial: 'aprobada', forzar_excepcion: false, motivo_excepcion: '' };

export default function VacationManagerCreateRequest({ apiBase, token, year, yearClosed = false, onChanged }) {
    const [participants, setParticipants] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) return;
        fetch(`${apiBase}/api/vacaciones/participants`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (response) => {
                const body = await response.json();
                if (!response.ok) throw new Error(body?.error || 'No se pudieron cargar los empleados.');
                setParticipants(Array.isArray(body) ? body.filter((item) => item.participa !== false) : []);
            })
            .catch((err) => setError(err.message));
    }, [apiBase, token]);

    useEffect(() => {
        setForm(emptyForm);
        setMessage('');
        setError('');
    }, [year]);

    const employees = useMemo(() => [...participants].sort((a, b) => String(a.empleado_nombre || '').localeCompare(String(b.empleado_nombre || ''), 'es')), [participants]);

    const submit = async (event) => {
        event.preventDefault();
        const endpointError = validateVacationEndpoints(form.fecha_inicio, form.fecha_fin);
        if (endpointError) {
            setError(endpointError);
            return;
        }
        setLoading(true);
        setMessage('');
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/manager-request`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudieron registrar las vacaciones.');
            setMessage(`Vacaciones registradas correctamente para ${body.empleado_nombre || 'el empleado'}.`);
            setForm(emptyForm);
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudieron registrar las vacaciones.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><CalendarPlus2 size={18} /></span>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Registrar vacaciones desde RRHH</h2>
                    <p className="mt-1 text-sm text-slate-500">Para empleados sin autoservicio, vacaciones comunicadas directamente o correcciones operativas.</p>
                    <p className="mt-1 text-xs font-medium text-slate-400">Jornada: {COMPANY_WORK_SCHEDULE.label}. Los fines de semana no se pueden usar como inicio o fin.</p>
                </div>
            </div>

            {yearClosed && <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600">El ejercicio {year} está cerrado. Reábrelo antes de registrar nuevas ausencias.</p>}

            <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <label className="xl:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Empleado</span>
                    <select required disabled={yearClosed} value={form.empleado_id} onChange={(e) => setForm((p) => ({ ...p, empleado_id: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value="">Selecciona empleado</option>
                        {employees.map((item) => <option key={item.empleado_id} value={item.empleado_id}>{item.empleado_nombre} · {item.departamento || '—'}</option>)}
                    </select>
                </label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600">Inicio</span><input required disabled={yearClosed} type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={form.fecha_inicio} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError('La fecha de inicio debe ser de lunes a viernes.'); setForm((p) => ({ ...p, fecha_inicio: '' })); return; } setError(''); setForm((p) => ({ ...p, fecha_inicio: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600">Fin</span><input required disabled={yearClosed} type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={form.fecha_fin} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError('La fecha de fin debe ser de lunes a viernes.'); setForm((p) => ({ ...p, fecha_fin: '' })); return; } setError(''); setForm((p) => ({ ...p, fecha_fin: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600">Estado inicial</span><select disabled={yearClosed} value={form.estado_inicial} onChange={(e) => setForm((p) => ({ ...p, estado_inicial: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="aprobada">Aprobada</option><option value="pendiente">Pendiente</option></select></label>
                <div className="flex items-end"><button disabled={yearClosed || loading} type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Guardando…' : 'Registrar'}</button></div>
                <label className="md:col-span-2 xl:col-span-4"><span className="mb-1 block text-xs font-semibold text-slate-600">Motivo / observación</span><input disabled={yearClosed} value={form.motivo} onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ej.: comunicado a RRHH, corrección, vacaciones pactadas…" /></label>
                <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 md:col-span-2 xl:col-span-2"><input disabled={yearClosed} type="checkbox" checked={form.forzar_excepcion} onChange={(e) => setForm((p) => ({ ...p, forzar_excepcion: e.target.checked }))} /> <ShieldAlert size={15} /> Autorizar excepción de cupo</label>
                {form.forzar_excepcion && <label className="md:col-span-2 xl:col-span-6"><span className="mb-1 block text-xs font-semibold text-amber-700">Motivo obligatorio de la excepción</span><input required value={form.motivo_excepcion} onChange={(e) => setForm((p) => ({ ...p, motivo_excepcion: e.target.value }))} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm" placeholder="Ej.: autorización de Dirección por cierre de campaña" /></label>}
            </form>
            {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {message && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        </section>
    );
}
