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
            onClick={(e) => e.target === backdropRef.current && closeModal()}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fadeIn"
        >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden animate-scaleIn">
                <header className="flex justify-between items-center px-6 py-4 border-b">
                    <h2 className="text-xl font-semibold">Visitas Cliente</h2>
                    <button onClick={closeModal} className="text-gray-600 hover:text-gray-800">
                        <FaTimes size={20} />
                    </button>
                </header>

                <div className="px-6 py-4">
                    {(error || successMsg) && (
                        <div
                            className={`mb-4 rounded-lg px-4 py-3 text-sm ${error
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}
                        >
                            {error || successMsg}
                        </div>
                    )}

                    {/* Toggle pendientes/completadas */}
                    <div className="flex gap-2 mb-4">
                        {[
                            { label: 'Pendientes', value: false },
                            { label: 'Completadas', value: true }
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                onClick={() => setShowCompleted(opt.value)}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium
                  ${showCompleted === opt.value
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Formulario nueva visita */}
                    {!showCompleted && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                            <input
                                type="date"
                                value={newVisit.date}
                                onChange={(e) =>
                                    setNewVisit({ ...newVisit, date: e.target.value })
                                }
                                className="border rounded px-3 py-2"
                                disabled={addingVisit}
                            />
                            <input
                                type="time"
                                value={newVisit.time}
                                onChange={(e) =>
                                    setNewVisit({ ...newVisit, time: e.target.value })
                                }
                                className="border rounded px-3 py-2"
                                disabled={addingVisit}
                            />
                            <input
                                type="text"
                                placeholder="Descripción"
                                value={newVisit.description}
                                onChange={(e) =>
                                    setNewVisit({ ...newVisit, description: e.target.value })
                                }
                                className="border rounded px-3 py-2 col-span-2"
                                disabled={addingVisit}
                            />
                            <select
                                value={newVisit.assignedTo}
                                onChange={(e) =>
                                    setNewVisit({ ...newVisit, assignedTo: e.target.value })
                                }
                                className="border rounded px-3 py-2"
                                disabled={addingVisit}
                            >
                                <option value="">Comercial...</option>
                                {commercialUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.username}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleAdd}
                                className="sm:col-span-1 bg-green-500 hover:bg-green-600 text-white rounded px-4 py-2 flex items-center justify-center gap-2 disabled:opacity-60"
                                disabled={addingVisit}
                            >
                                {addingVisit ? (
                                    <>
                                        <InlineSpinner className="w-4 h-4 text-white" /> Añadiendo…
                                    </>
                                ) : (
                                    <>
                                        <FaPlus className="mr-2" /> Añadir
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Listado de visitas */}
                    {loading ? (
                        <div className="flex justify-center py-10 text-gray-500">
                            <FaSpinner className="animate-spin mr-2" /> Cargando...
                        </div>
                    ) : visits.length === 0 ? (
                        <p className="text-center text-gray-600 py-8">
                            {showCompleted
                                ? 'No hay visitas completadas.'
                                : 'No hay visitas pendientes.'}
                        </p>
                    ) : (
                        <ul className="space-y-3 max-h-80 overflow-y-auto">
                            {visits.map((v) => (
                                <li
                                    key={v.id}
                                    className="bg-white border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between shadow-sm hover:shadow"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1 text-sm text-gray-600">
                                            {v.estado === 'completada' ? (
                                                <FaCheckCircle className="text-green-500" />
                                            ) : (
                                                <FaClock className="text-yellow-500" />
                                            )}
                                            <time>{new Date(v.fecha).toLocaleString()}</time>
                                        </div>
                                        <p className="font-medium text-gray-800 mb-1">
                                            {v.descripcion}
                                        </p>
                                        <div className="text-xs text-gray-500 flex flex-wrap gap-4">
                                            <span>👤 {v.creado_por}</span>
                                            <span>
                                                <FaUserTie className="inline-block" />{' '}
                                                {v.asignado_a || '-'}
                                            </span>
                                            {v.estado === 'completada' && (
                                                <span className="mt-1">
                                                    Completado por: <strong>{v.completado_por}</strong>
                                                    {v.mensaje_completado && ` — "${v.mensaje_completado}"`}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Acciones */}
                                    <div className="mt-3 sm:mt-0 sm:ml-4 flex-shrink-0 flex flex-col gap-2">
                                        {/* Completar solo pendientes */}
                                        {v.estado === 'pendiente' && !showCompleted && (
                                            completingId === v.id ? (
                                                <>
                                                    <textarea
                                                        value={completionMsg}
                                                        onChange={(e) => setCompletionMsg(e.target.value)}
                                                        placeholder="Mensaje de completado..."
                                                        className="border rounded px-2 py-1 text-sm mb-1"
                                                        disabled={completingLoadingId === v.id}
                                                    />
                                                    <button
                                                        onClick={() => handleComplete(v.id)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                                        disabled={completingLoadingId === v.id}
                                                    >
                                                        {completingLoadingId === v.id ? (
                                                            <>
                                                                <InlineSpinner className="w-4 h-4 text-white" /> Guardando…
                                                            </>
                                                        ) : (
                                                            <>
                                                                <FaCheckCircle className="inline mr-1" /> Ok
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setCompletingId(v.id);
                                                        setCompletionMsg('');
                                                        setError('');
                                                    }}
                                                    className="bg-blue-500 hover:bg-blue-600 text-white rounded px-3 py-1 text-sm flex items-center justify-center"
                                                >
                                                    <FaCheckCircle className="mr-1" /> Completar
                                                </button>
                                            )
                                        )}

                                        {/* Eliminar: pendientes siempre; completadas solo admin */}
                                        {(v.estado === 'pendiente' || (v.estado === 'completada' && isAdmin)) && (
                                            <button
                                                onClick={() => handleDelete(v)}
                                                className={`flex items-center justify-center px-3 py-1 text-sm rounded
                          ${v.estado === 'pendiente'
                                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                                        : 'bg-red-700 hover:bg-red-800 text-white'
                                                    }
                        `}
                                            >
                                                <FaTrash className="mr-1" /> Eliminar
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {confirmDelete && (
                <ConfirmDialog
                    message={`¿Eliminar la visita "${confirmDelete.descripcion}"?`}
                    onCancel={() => {
                        if (deleteLoading) return;
                        setConfirmDelete(null);
                    }}
                    onConfirm={confirmDeleteVisit}
                    confirmLabel="Eliminar"
                    loading={deleteLoading}
                />
            )}
        </div>
    );
}
