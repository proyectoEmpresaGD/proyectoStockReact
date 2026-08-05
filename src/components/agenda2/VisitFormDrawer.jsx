import React, { useEffect, useMemo, useState } from 'react';
import {
    BellRing,
    CalendarCheck2,
    CalendarPlus2,
    CheckCircle2,
    ChevronDown,
    Clock3,
    Save,
    Sparkles,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { agendaClient } from '../../services/agendaClient';
import { AgendaDrawer, ClientPicker, TeamSelect } from './AgendaUI';
import { PRIORITIES, toLocalInput, VISIT_TYPES } from './agendaUtils';

function roundedFutureDate() {
    const date = new Date();
    date.setSeconds(0, 0);
    if (date.getMinutes() < 30) date.setMinutes(30);
    else {
        date.setHours(date.getHours() + 1);
        date.setMinutes(0);
    }
    return date;
}

function defaultStart() {
    return toLocalInput(roundedFutureDate());
}

function tomorrowAt(hour = 10) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);
    return toLocalInput(date);
}

function nextMondayAt(hour = 10) {
    const date = new Date();
    const days = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return toLocalInput(date);
}

function suggestedReminder(value) {
    const start = new Date(value);
    const difference = start.getTime() - Date.now();
    if (!Number.isFinite(difference) || difference <= 20 * 60_000) return 'none';
    if (difference <= 75 * 60_000) return '15';
    return '60';
}

const reminderOptions = [
    { value: 'none', label: 'Sin recordatorio' },
    { value: '15', label: '15 minutos antes' },
    { value: '60', label: '1 hora antes' },
    { value: '1440', label: '1 día antes' },
    { value: 'custom', label: 'Fecha personalizada' },
];

const objectiveSuggestions = [
    'Presentación de colección',
    'Seguimiento de pedido',
    'Entrega de muestras',
    'Reunión de proyecto Contract',
    'Revisión de necesidades',
];

export default function VisitFormDrawer({ open, token, users, currentUser, visit, initialDate, initialClient, onClose, onSaved }) {
    const editing = Boolean(visit?.id);
    const [client, setClient] = useState(null);
    const [form, setForm] = useState({});
    const [reminderMode, setReminderMode] = useState('60');
    const [reminderTouched, setReminderTouched] = useState(false);
    const [customReminder, setCustomReminder] = useState('');
    const [recordCompleted, setRecordCompleted] = useState(false);
    const [completedResult, setCompletedResult] = useState('');
    const [showFollowUp, setShowFollowUp] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        const startValue = toLocalInput(visit?.fecha || initialDate) || defaultStart();
        const duration = Number(visit?.duracion_minutos) || 60;
        setClient(visit ? {
            codclien: visit.cliente_id,
            razclien: visit.cliente_nombre || visit.cliente_id,
        } : initialClient || null);
        setForm({
            titulo: visit?.titulo || '',
            descripcion: visit?.descripcion || '',
            fecha: startValue,
            duracion_minutos: duration,
            tipo: visit?.tipo || 'visita',
            prioridad: visit?.prioridad || 'media',
            assigned_to: visit?.assigned_to || currentUser?.id || null,
            proxima_accion: visit?.proxima_accion || '',
            fecha_proxima_accion: toLocalInput(visit?.fecha_proxima_accion),
        });
        setReminderMode(editing ? 'none' : suggestedReminder(startValue));
        setReminderTouched(false);
        setCustomReminder('');
        setRecordCompleted(false);
        setCompletedResult('');
        setShowFollowUp(Boolean(visit?.proxima_accion || visit?.fecha_proxima_accion));
        setError('');
    }, [currentUser?.id, editing, initialClient, initialDate, open, visit]);

    const endLabel = useMemo(() => {
        if (!form.fecha) return '';
        const start = new Date(form.fecha);
        if (Number.isNaN(start.getTime())) return '';
        const end = new Date(start.getTime() + (Number(form.duracion_minutos) || 60) * 60_000);
        return end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }, [form.duracion_minutos, form.fecha]);

    const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

    const changeStart = (value) => {
        setField('fecha', value);
        if (!editing && !recordCompleted && !reminderTouched) setReminderMode(suggestedReminder(value));
    };

    const setQuickDate = (value) => {
        changeStart(value);
        setError('');
    };

    const handleSubmit = async () => {
        setError('');
        if (!client?.codclien) return setError('Selecciona un cliente de la lista.');
        if (!form.titulo?.trim()) return setError('Escribe un objetivo o título para la visita.');
        if (!form.fecha) return setError('Selecciona la fecha y la hora.');
        if (!form.assigned_to) return setError('Selecciona el responsable de la visita.');

        const start = new Date(form.fecha);
        if (Number.isNaN(start.getTime())) return setError('La fecha seleccionada no es válida.');
        const now = Date.now();
        if (!editing && !recordCompleted && start.getTime() < now - 5 * 60_000) {
            return setError('La fecha ya ha pasado. Marca “Registrar una visita ya realizada” para guardarla directamente en el historial.');
        }
        if (!editing && recordCompleted && start.getTime() > now + 5 * 60_000) {
            return setError('Una visita ya realizada no puede tener una fecha futura.');
        }
        if (!editing && recordCompleted && !completedResult.trim()) {
            return setError('Escribe brevemente el resultado de la visita realizada.');
        }

        const hasNextAction = Boolean(form.proxima_accion?.trim());
        const hasNextDate = Boolean(form.fecha_proxima_accion);
        if (hasNextAction !== hasNextDate) {
            return setError('Para crear un seguimiento debes indicar tanto la próxima acción como su fecha.');
        }

        const duration = Number(form.duracion_minutos) || 60;
        const visitPayload = {
            cliente_id: client.codclien,
            titulo: form.titulo.trim(),
            descripcion: form.descripcion?.trim() || '',
            fecha: start.toISOString(),
            fecha_fin: new Date(start.getTime() + duration * 60_000).toISOString(),
            duracion_minutos: duration,
            tipo: form.tipo,
            prioridad: form.prioridad,
            assigned_to: Number(form.assigned_to),
            proxima_accion: recordCompleted ? null : (form.proxima_accion?.trim() || null),
            fecha_proxima_accion: recordCompleted ? null : (form.fecha_proxima_accion ? new Date(form.fecha_proxima_accion).toISOString() : null),
        };

        if (!editing && !recordCompleted && reminderMode !== 'none') {
            let reminderDate;
            if (reminderMode === 'custom') reminderDate = customReminder ? new Date(customReminder) : null;
            else reminderDate = new Date(start.getTime() - Number(reminderMode) * 60_000);
            if (!reminderDate || Number.isNaN(reminderDate.getTime())) return setError('Selecciona una fecha válida para el recordatorio.');
            if (reminderDate >= start) return setError('El recordatorio debe producirse antes de la visita.');
            if (reminderDate <= new Date()) return setError('El recordatorio debe estar en el futuro. Selecciona otro aviso o elige “Sin recordatorio”.');
            visitPayload.recordatorio_fecha = reminderDate.toISOString();
        }

        setSaving(true);
        try {
            let saved;
            if (editing) {
                saved = await agendaClient.updateVisit(token, visit.id, visitPayload);
            } else if (recordCompleted) {
                saved = await agendaClient.createCompletedVisit(token, {
                    ...visitPayload,
                    resultado: completedResult.trim(),
                    proxima_accion: form.proxima_accion?.trim() || null,
                    fecha_proxima_accion: form.fecha_proxima_accion ? new Date(form.fecha_proxima_accion).toISOString() : null,
                });
            } else {
                saved = await agendaClient.createVisit(token, visitPayload);
            }
            toast.success(editing ? 'Visita actualizada' : recordCompleted ? 'Visita realizada registrada en el historial' : 'Visita creada correctamente');
            onSaved?.(saved);
            onClose?.();
        } catch (requestError) {
            setError(requestError.message || 'No se pudo guardar la visita.');
        } finally {
            setSaving(false);
        }
    };

    const footer = (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="cjm-icon-button min-h-11 rounded-xl px-5 font-medium" disabled={saving}>Cancelar</button>
            <button type="button" onClick={handleSubmit} className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-semibold" disabled={saving}>
                {recordCompleted && !editing ? <CheckCircle2 size={17} /> : <Save size={17} />}
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : recordCompleted ? 'Registrar visita realizada' : 'Crear visita'}
            </button>
        </div>
    );

    return (
        <AgendaDrawer open={open} onClose={onClose} title={editing ? 'Editar visita' : 'Nueva visita'} eyebrow="Agenda comercial" footer={footer} size="xl">
            <div className="agenda2-form-grid">
                {!editing && (
                    <section className="agenda2-form-section sm:col-span-2 agenda2-completed-toggle-section">
                        <button type="button" className={`agenda2-completed-toggle ${recordCompleted ? 'active' : ''}`} onClick={() => {
                            const nextValue = !recordCompleted;
                            setRecordCompleted(nextValue);
                            changeStart(nextValue ? toLocalInput(new Date()) : defaultStart());
                            setReminderMode(nextValue ? 'none' : suggestedReminder(defaultStart()));
                            setReminderTouched(nextValue);
                            setError('');
                        }} aria-pressed={recordCompleted}>
                            <span><CalendarCheck2 size={20} /></span>
                            <span><strong>Registrar una visita ya realizada</strong><small>Úsalo cuando la visita ya ocurrió y quieres incorporarla directamente al historial del cliente.</small></span>
                        </button>
                    </section>
                )}

                <section className="agenda2-form-section sm:col-span-2">
                    <div className="agenda2-section-heading">
                        <span><CalendarPlus2 size={19} /></span>
                        <div><h3>Información principal</h3><p>Selecciona el cliente y resume claramente el objetivo.</p></div>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <ClientPicker token={token} value={client} onChange={setClient} disabled={saving} />
                        <label className="agenda2-field">
                            <span>Objetivo o título</span>
                            <input className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.titulo || ''} onChange={(event) => setField('titulo', event.target.value)} maxLength={160} placeholder="Ej. Presentación de nueva colección" disabled={saving} />
                        </label>
                        <div className="agenda2-objective-suggestions sm:col-span-2">
                            <span><Sparkles size={14} /> Objetivos frecuentes</span>
                            <div>{objectiveSuggestions.map((label) => <button type="button" key={label} onClick={() => setField('titulo', label)} disabled={saving}>{label}</button>)}</div>
                        </div>
                        <label className="agenda2-field sm:col-span-2">
                            <span>Descripción y preparación</span>
                            <textarea className="cjm-input min-h-28 rounded-xl px-3 py-3 text-base" value={form.descripcion || ''} onChange={(event) => setField('descripcion', event.target.value)} placeholder="Temas a tratar, muestras necesarias, personas de contacto…" disabled={saving} />
                        </label>
                    </div>
                </section>

                <section className="agenda2-form-section">
                    <div className="agenda2-section-heading"><span><Clock3 size={19} /></span><div><h3>{recordCompleted ? 'Cuándo se realizó' : 'Fecha y duración'}</h3><p>{recordCompleted ? 'Indica la fecha real para ordenar correctamente el historial.' : 'El final se calcula automáticamente.'}</p></div></div>
                    <div className="mt-5 grid gap-4">
                        {!recordCompleted && (
                            <div className="agenda2-date-shortcuts">
                                <button type="button" onClick={() => setQuickDate(defaultStart())}>Próximo hueco</button>
                                <button type="button" onClick={() => setQuickDate(tomorrowAt())}>Mañana 10:00</button>
                                <button type="button" onClick={() => setQuickDate(nextMondayAt())}>Próximo lunes</button>
                            </div>
                        )}
                        <label className="agenda2-field">
                            <span>Inicio</span>
                            <div className="agenda2-native-date"><input type="datetime-local" value={form.fecha || ''} onChange={(event) => changeStart(event.target.value)} disabled={saving} /></div>
                        </label>
                        <label className="agenda2-field">
                            <span>Duración</span>
                            <select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.duracion_minutos || 60} onChange={(event) => setField('duracion_minutos', Number(event.target.value))} disabled={saving}>
                                {[30, 45, 60, 90, 120, 180, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</option>)}
                            </select>
                            {form.fecha && <small className="cjm-muted">Final previsto: {endLabel}</small>}
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="agenda2-field"><span>Tipo</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.tipo || 'visita'} onChange={(event) => setField('tipo', event.target.value)} disabled={saving}>{VISIT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                            <label className="agenda2-field"><span>Prioridad</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={form.prioridad || 'media'} onChange={(event) => setField('prioridad', event.target.value)} disabled={saving}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                        </div>
                        <TeamSelect users={users} value={form.assigned_to} onChange={(value) => setField('assigned_to', value)} disabled={saving} allowEmpty={false} />
                    </div>
                </section>

                <section className="agenda2-form-section">
                    <div className="agenda2-section-heading"><span>{recordCompleted ? <CheckCircle2 size={19} /> : <BellRing size={19} />}</span><div><h3>{recordCompleted ? 'Resultado y seguimiento' : 'Aviso y seguimiento'}</h3><p>{recordCompleted ? 'Deja registrado qué ocurrió y cuál es el siguiente paso.' : 'Configura un aviso y añade una próxima acción solo cuando sea necesaria.'}</p></div></div>
                    <div className="mt-5 grid gap-4">
                        {recordCompleted && !editing && (
                            <label className="agenda2-field"><span>Resultado de la visita</span><textarea className="cjm-input min-h-28 rounded-xl px-3 py-3 text-base" value={completedResult} onChange={(event) => setCompletedResult(event.target.value)} placeholder="Qué se habló, qué necesita el cliente y qué se acordó" disabled={saving} /></label>
                        )}
                        {!editing && !recordCompleted && (
                            <>
                                <label className="agenda2-field"><span>Recordatorio</span><select className="cjm-input min-h-11 rounded-xl px-3 text-base" value={reminderMode} onChange={(event) => { setReminderMode(event.target.value); setReminderTouched(true); }} disabled={saving}>{reminderOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                                {reminderMode === 'custom' && <label className="agenda2-field"><span>Fecha del aviso</span><div className="agenda2-native-date"><input type="datetime-local" value={customReminder} onChange={(event) => setCustomReminder(event.target.value)} disabled={saving} /></div></label>}
                            </>
                        )}
                        <button type="button" className={`agenda2-followup-toggle ${showFollowUp ? 'active' : ''}`} onClick={() => setShowFollowUp((value) => !value)} aria-expanded={showFollowUp}>
                            <span><strong>{showFollowUp ? 'Ocultar próxima acción' : 'Añadir próxima acción'}</strong><small>La acción y la fecha aparecerán juntas en Seguimientos.</small></span><ChevronDown size={18} />
                        </button>
                        {showFollowUp && (
                            <div className="grid gap-4 agenda2-followup-fields">
                                <label className="agenda2-field"><span>Próxima acción</span><textarea className="cjm-input min-h-20 rounded-xl px-3 py-3 text-base" value={form.proxima_accion || ''} onChange={(event) => setField('proxima_accion', event.target.value)} placeholder="Ej. Llamar para confirmar el pedido" disabled={saving} /></label>
                                <label className="agenda2-field"><span>Fecha de seguimiento</span><div className="agenda2-native-date"><input type="datetime-local" value={form.fecha_proxima_accion || ''} onChange={(event) => setField('fecha_proxima_accion', event.target.value)} disabled={saving} /></div></label>
                            </div>
                        )}
                    </div>
                </section>
            </div>
            {error && <div className="agenda2-error mt-5" role="alert">{error}</div>}
        </AgendaDrawer>
    );
}
