// src/components/visits/VisitModal.jsx
import React, { useEffect, useState, useRef } from 'react';
import {
    FaTimes,
    FaCheckCircle,
    FaClock,
    FaTrash,
    FaUserTie,
    FaPlus,
    FaSpinner
} from 'react-icons/fa';
import { useAuthContext } from '../../Auth/AuthContext';
import InlineSpinner from '../common/InlineSpinner.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';

export default function VisitModal({
    modalVisible,
    selectedClientId,
    closeModal,
    updateLastVisitDate
}) {
    const { token, user } = useAuthContext();
    const isAdmin = user.role === 'admin';

    const [visits, setVisits] = useState([]);
    const [commercialUsers, setCommercialUsers] = useState([]);
    const [newVisit, setNewVisit] = useState({
        date: '',
        time: '',
        description: '',
        assignedTo: ''
    });
    const [showCompleted, setShowCompleted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [completingId, setCompletingId] = useState(null);
    const [completionMsg, setCompletionMsg] = useState('');

    const [completingLoadingId, setCompletingLoadingId] = useState(null);
    const [addingVisit, setAddingVisit] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const backdropRef = useRef();

    useEffect(() => {
        if (!successMsg) return;
        const timer = window.setTimeout(() => setSuccessMsg(''), 4000);
        return () => window.clearTimeout(timer);
    }, [successMsg]);

    // Cerrar con Escape
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && closeModal();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeModal]);

    // Carga visitas y comerciales
    useEffect(() => {
        if (!modalVisible || !selectedClientId) return;
        setLoading(true);
        Promise.all([
            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}?showCompleted=${showCompleted}`,
                { headers: { Authorization: `Bearer ${token}` } }
            ).then((r) => r.json()),
            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/auth/users/commercial`,
                { headers: { Authorization: `Bearer ${token}` } }
            ).then((r) => r.json())
        ])
            .then(([visitsData, usersData]) => {
                setVisits(visitsData);
                setCommercialUsers(usersData);
                setError('');
            })
            .catch(() => setError('Error cargando datos'))
            .finally(() => setLoading(false));
    }, [modalVisible, selectedClientId, showCompleted, token]);

    const handleAdd = async () => {
        if (addingVisit) return;
        setError('');
        setSuccessMsg('');
        const { date, time, description, assignedTo } = newVisit;
        if (!date || !time || !description || !assignedTo) {
            setError('Todos los campos son obligatorios');
            return;
        }
        try {
            setAddingVisit(true);
            const fecha = `${date}T${time}`;
            await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        fecha,
                        descripcion: description,
                        creado_por: user.id,
                        asignado_a: parseInt(assignedTo, 10)
                    })
                }
            );
            updateLastVisitDate(selectedClientId, date);
            setNewVisit({ date: '', time: '', description: '', assignedTo: '' });
            // refrescar
            const resp = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}?showCompleted=${showCompleted}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setVisits(await resp.json());
            setSuccessMsg('Visita creada correctamente.');
        } catch {
            setError('No se pudo agregar la visita');
        } finally {
            setAddingVisit(false);
        }
    };

    const handleComplete = async (id) => {
        if (completingLoadingId) return;
        if (!completionMsg.trim()) {
            setError('Mensaje es obligatorio');
            return;
        }
        try {
            setError('');
            setSuccessMsg('');
            setCompletingLoadingId(id);
            await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/${id}/complete`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        mensaje_completado: completionMsg,
                        completado_por: user.id
                    })
                }
            );
            setCompletingId(null);
            setCompletionMsg('');
            // refrescar
            const resp = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}?showCompleted=${showCompleted}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setVisits(await resp.json());
            setSuccessMsg('Visita marcada como completada.');
        } catch {
            setError('No se pudo completar');
        } finally {
            setCompletingLoadingId(null);
        }
    };

    const handleDelete = (visit) => {
        // solo admin puede borrar completadas
        if (visit.estado === 'completada' && !isAdmin) return;
        setError('');
        setSuccessMsg('');
        setConfirmDelete(visit);
    };

    const confirmDeleteVisit = async () => {
        if (!confirmDelete || deleteLoading) return;
        setDeleteLoading(true);
        try {
            await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/${confirmDelete.id}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
            setVisits((v) => v.filter((x) => x.id !== confirmDelete.id));
            setSuccessMsg('Visita eliminada correctamente.');
        } catch {
            setError('No se pudo eliminar');
        } finally {
            setDeleteLoading(false);
            setConfirmDelete(null);
        }
    };

    if (!modalVisible) return null;

    return (
        <div
            ref={backdropRef}
            onMouseDown={(event) => event.target === backdropRef.current && closeModal()}
            className="cjm-modal-backdrop z-[1050]"
            role="presentation"
        >
            <section className="cjm-modal sm:max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="visit-modal-title">
                <div className="cjm-modal-header flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
                    <div>
                        <p className="cjm-kicker">Actividad comercial</p>
                        <h2 id="visit-modal-title" className="mt-1 text-lg font-semibold app-text sm:text-xl">
                            Visitas del cliente
                        </h2>
                        <p className="cjm-muted mt-1 text-sm">Programa, completa y consulta visitas comerciales.</p>
                    </div>
                    <button
                        type="button"
                        onClick={closeModal}
                        className="cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        aria-label="Cerrar visitas"
                    >
                        <FaTimes aria-hidden="true" />
                    </button>
                </div>

                <div className="cjm-modal-body px-4 py-5 sm:px-6">
                    {(error || successMsg) && (
                        <div className={`cjm-alert mb-4 ${error ? 'cjm-alert-error' : 'cjm-alert-success'}`}>
                            {error || successMsg}
                        </div>
                    )}

                    <div className="cjm-segmented grid w-full grid-cols-2" aria-label="Estado de las visitas">
                        {[
                            { label: 'Pendientes', value: false },
                            { label: 'Completadas', value: true },
                        ].map((option) => (
                            <button
                                type="button"
                                key={option.label}
                                onClick={() => setShowCompleted(option.value)}
                                aria-pressed={showCompleted === option.value}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {!showCompleted && (
                        <section className="cjm-toolbar mt-4" aria-labelledby="new-visit-title">
                            <h3 id="new-visit-title" className="text-sm font-semibold app-text">Nueva visita</h3>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <label className="block">
                                    <span className="cjm-control-label">Fecha</span>
                                    <span className="flex min-h-11 w-full min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-3 py-2">
                                        <input
                                            type="date"
                                            value={newVisit.date}
                                            onChange={(event) => setNewVisit({ ...newVisit, date: event.target.value })}
                                            className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none"
                                            disabled={addingVisit}
                                        />
                                    </span>
                                </label>
                                <label className="block">
                                    <span className="cjm-control-label">Hora</span>
                                    <span className="flex min-h-11 w-full min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-3 py-2">
                                        <input
                                            type="time"
                                            value={newVisit.time}
                                            onChange={(event) => setNewVisit({ ...newVisit, time: event.target.value })}
                                            className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none"
                                            disabled={addingVisit}
                                        />
                                    </span>
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="cjm-control-label">Descripción</span>
                                    <input
                                        type="text"
                                        placeholder="Motivo o información de la visita"
                                        value={newVisit.description}
                                        onChange={(event) => setNewVisit({ ...newVisit, description: event.target.value })}
                                        className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                                        disabled={addingVisit}
                                    />
                                </label>
                                <label className="block sm:col-span-2 lg:col-span-3">
                                    <span className="cjm-control-label">Comercial asignado</span>
                                    <select
                                        value={newVisit.assignedTo}
                                        onChange={(event) => setNewVisit({ ...newVisit, assignedTo: event.target.value })}
                                        className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                                        disabled={addingVisit}
                                    >
                                        <option value="">Seleccionar comercial</option>
                                        {commercialUsers.map((commercial) => (
                                            <option key={commercial.id} value={commercial.id}>{commercial.username}</option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAdd}
                                    className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:col-span-2 lg:col-span-1"
                                    disabled={addingVisit}
                                >
                                    {addingVisit ? (
                                        <>
                                            <InlineSpinner className="h-4 w-4 text-white" srLabel="Añadiendo visita" />
                                            Añadiendo…
                                        </>
                                    ) : (
                                        <>
                                            <FaPlus aria-hidden="true" />
                                            Añadir visita
                                        </>
                                    )}
                                </button>
                            </div>
                        </section>
                    )}

                    <section className="mt-5" aria-label="Listado de visitas">
                        {loading ? (
                            <div className="cjm-empty-state flex min-h-36 items-center justify-center">
                                <span className="inline-flex items-center gap-2 text-sm font-semibold app-text">
                                    <FaSpinner className="animate-spin text-[var(--cjm-primary-deep)]" />
                                    Cargando visitas…
                                </span>
                            </div>
                        ) : visits.length === 0 ? (
                            <div className="cjm-empty-state py-9">
                                <p className="font-semibold app-text">
                                    {showCompleted ? 'No hay visitas completadas' : 'No hay visitas pendientes'}
                                </p>
                                <p className="cjm-muted mt-2 text-sm">
                                    {showCompleted
                                        ? 'Las visitas finalizadas aparecerán aquí.'
                                        : 'Añade una nueva visita mediante el formulario superior.'}
                                </p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {visits.map((visit) => (
                                    <li key={visit.id} className="cjm-data-card">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 text-sm cjm-muted">
                                                    {visit.estado === 'completada' ? (
                                                        <FaCheckCircle className="text-emerald-500" aria-hidden="true" />
                                                    ) : (
                                                        <FaClock className="text-amber-500" aria-hidden="true" />
                                                    )}
                                                    <time>{new Date(visit.fecha).toLocaleString('es-ES')}</time>
                                                    <span className="cjm-badge">{visit.estado}</span>
                                                </div>
                                                <p className="mt-2 break-words font-semibold app-text">{visit.descripcion}</p>
                                                <div className="cjm-muted mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4">
                                                    <span>Creada por: {visit.creado_por || '—'}</span>
                                                    <span><FaUserTie className="inline" /> Asignada a: {visit.asignado_a || '—'}</span>
                                                    {visit.estado === 'completada' && (
                                                        <span className="basis-full break-words">
                                                            Completada por <strong>{visit.completado_por || '—'}</strong>
                                                            {visit.mensaje_completado && ` · ${visit.mensaje_completado}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-48">
                                                {visit.estado === 'pendiente' && !showCompleted && (
                                                    completingId === visit.id ? (
                                                        <>
                                                            <textarea
                                                                value={completionMsg}
                                                                onChange={(event) => setCompletionMsg(event.target.value)}
                                                                placeholder="Resultado de la visita"
                                                                className="cjm-input min-h-24 resize-y rounded-xl px-3 py-2.5 text-sm"
                                                                disabled={completingLoadingId === visit.id}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleComplete(visit.id)}
                                                                className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
                                                                disabled={completingLoadingId === visit.id}
                                                            >
                                                                {completingLoadingId === visit.id ? (
                                                                    <InlineSpinner className="h-4 w-4 text-white" srLabel="Guardando" />
                                                                ) : (
                                                                    <FaCheckCircle aria-hidden="true" />
                                                                )}
                                                                {completingLoadingId === visit.id ? 'Guardando…' : 'Confirmar'}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setCompletingId(visit.id);
                                                                setCompletionMsg('');
                                                                setError('');
                                                            }}
                                                            className="cjm-secondary-button"
                                                        >
                                                            <FaCheckCircle aria-hidden="true" />
                                                            Completar
                                                        </button>
                                                    )
                                                )}

                                                {(visit.estado === 'pendiente' || (visit.estado === 'completada' && isAdmin)) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(visit)}
                                                        className="cjm-danger-button"
                                                    >
                                                        <FaTrash aria-hidden="true" />
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </section>

            {confirmDelete && (
                <ConfirmDialog
                    title="Eliminar visita"
                    message={`¿Eliminar la visita “${confirmDelete.descripcion}”?`}
                    onCancel={() => {
                        if (!deleteLoading) setConfirmDelete(null);
                    }}
                    onConfirm={confirmDeleteVisit}
                    confirmLabel="Eliminar visita"
                    loading={deleteLoading}
                    destructive
                />
            )}
        </div>
    );
}
