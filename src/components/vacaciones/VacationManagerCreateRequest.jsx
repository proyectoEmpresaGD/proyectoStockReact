import { translateCurrent } from '../../i18n/translations.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
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
            setMessage(translateCurrent('Vacaciones registradas correctamente para {person}.', { person: body.empleado_nombre || translateCurrent('el empleado') }));
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
                    <h2 className="text-lg font-semibold text-slate-900"><TranslatedText>Registrar vacaciones desde RRHH</TranslatedText></h2>
                    <p className="mt-1 text-sm text-slate-500"><TranslatedText>Para empleados sin autoservicio, vacaciones comunicadas directamente o correcciones operativas.</TranslatedText></p>
                    <p className="mt-1 text-xs font-medium text-slate-400"><TranslatedText>Jornada:</TranslatedText> {COMPANY_WORK_SCHEDULE.label}<TranslatedText>. Los fines de semana no se pueden usar como inicio o fin.</TranslatedText></p>
                </div>
            </div>

            {yearClosed && <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"><TranslatedText>El ejercicio</TranslatedText> {year} <TranslatedText>está cerrado. Reábrelo antes de registrar nuevas ausencias.</TranslatedText></p>}

            <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <label className="xl:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-slate-600"><TranslatedText>Empleado</TranslatedText></span>
                    <select required disabled={yearClosed} value={form.empleado_id} onChange={(e) => setForm((p) => ({ ...p, empleado_id: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <option value=""><TranslatedText>Selecciona empleado</TranslatedText></option>
                        {employees.map((item) => <option key={item.empleado_id} value={item.empleado_id}>{item.empleado_nombre} · {item.departamento || '—'}</option>)}
                    </select>
                </label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600"><TranslatedText>Inicio</TranslatedText></span><input required disabled={yearClosed} type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={form.fecha_inicio} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError(translateCurrent('La fecha de inicio debe ser de lunes a viernes.')); setForm((p) => ({ ...p, fecha_inicio: '' })); return; } setError(''); setForm((p) => ({ ...p, fecha_inicio: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600"><TranslatedText>Fin</TranslatedText></span><input required disabled={yearClosed} type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={form.fecha_fin} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError(translateCurrent('La fecha de fin debe ser de lunes a viernes.')); setForm((p) => ({ ...p, fecha_fin: '' })); return; } setError(''); setForm((p) => ({ ...p, fecha_fin: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-600"><TranslatedText>Estado inicial</TranslatedText></span><select disabled={yearClosed} value={form.estado_inicial} onChange={(e) => setForm((p) => ({ ...p, estado_inicial: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="aprobada"><TranslatedText>Aprobada</TranslatedText></option><option value="pendiente"><TranslatedText>Pendiente</TranslatedText></option></select></label>
                <div className="flex items-end"><button disabled={yearClosed || loading} type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Guardando…' : 'Registrar'}</button></div>
                <label className="md:col-span-2 xl:col-span-4"><span className="mb-1 block text-xs font-semibold text-slate-600"><TranslatedText>Motivo / observación</TranslatedText></span><LocalizedElement><input disabled={yearClosed} value={form.motivo} onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ej.: comunicado a RRHH, corrección, vacaciones pactadas…" /></LocalizedElement></label>
                <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 md:col-span-2 xl:col-span-2"><input disabled={yearClosed} type="checkbox" checked={form.forzar_excepcion} onChange={(e) => setForm((p) => ({ ...p, forzar_excepcion: e.target.checked }))} /> <ShieldAlert size={15} /> <TranslatedText>Autorizar excepción de cupo</TranslatedText></label>
                {form.forzar_excepcion && <label className="md:col-span-2 xl:col-span-6"><span className="mb-1 block text-xs font-semibold text-amber-700"><TranslatedText>Motivo obligatorio de la excepción</TranslatedText></span><LocalizedElement><input required value={form.motivo_excepcion} onChange={(e) => setForm((p) => ({ ...p, motivo_excepcion: e.target.value }))} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm" placeholder="Ej.: autorización de Dirección por cierre de campaña" /></LocalizedElement></label>}
            </form>
            {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {message && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        </section>
    );
}
