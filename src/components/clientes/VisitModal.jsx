import { useEffect, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext';

function VisitModal({ modalVisible, selectedClientId, closeModal, updateLastVisitDate }) {
    const { token, user } = useAuthContext();
    const [visits, setVisits] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newVisit, setNewVisit] = useState({ date: '', description: '' });
    const [error, setError] = useState(null);
    const [completionMessage, setCompletionMessage] = useState('');
    const [visitToComplete, setVisitToComplete] = useState(null);
    const [showCompleted, setShowCompleted] = useState(false);

    useEffect(() => {
        if (modalVisible && selectedClientId) {
            fetchVisits(selectedClientId);
        }
    }, [modalVisible, selectedClientId, showCompleted]);

    const fetchVisits = async (clientId) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${clientId}?showCompleted=${showCompleted}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setVisits(data);
            } else {
                console.error('Failed to fetch visits');
            }
        } catch (error) {
            console.error('Error fetching visits:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const addVisit = async () => {
        if (!newVisit.date || !newVisit.description) {
            setError("Both date and description are required.");
            return;
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ...newVisit, created_by: user.id })
            });
            if (response.ok) {
                setNewVisit({ date: '', description: '' });
                setError(null);
                fetchVisits(selectedClientId);
                updateLastVisitDate(selectedClientId, newVisit.date);
            } else {
                console.error('Failed to add visit');
            }
        } catch (error) {
            console.error('Error adding visit:', error);
        }
    };

    const completeVisit = async (visitId) => {
        if (!completionMessage) {
            setError("Completion message is required.");
            return;
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/${visitId}/complete`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ mensaje_completado: completionMessage, completed_by: user.id })
            });
            if (response.ok) {
                fetchVisits(selectedClientId);
                setVisitToComplete(null);
                setCompletionMessage('');
                setError(null);
            } else {
                console.error('Failed to complete visit');
            }
        } catch (error) {
            console.error('Error completing visit:', error);
        }
    };

    const deleteVisit = async (visitId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/${visitId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setVisits(visits.filter(visit => visit.id !== visitId));
            } else {
                console.error('Failed to delete visit');
            }
        } catch (error) {
            console.error('Error deleting visit:', error);
        }
    };

    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white p-4 rounded shadow-lg max-w-4xl w-full relative mx-2">
                    <h2 className="text-xl font-bold mb-4">Visitas del Cliente</h2>
                    <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 hover:text-gray-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div className="flex items-center mb-4">
                        <button
                            onClick={() => setShowCompleted(false)}
                            className={`px-4 py-2 rounded ${!showCompleted ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                        >
                            Pendientes
                        </button>
                        <button
                            onClick={() => setShowCompleted(true)}
                            className={`px-4 py-2 ml-2 rounded ${showCompleted ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                        >
                            Completadas
                        </button>
                    </div>

                    {!showCompleted && (
                        <div className="mb-4">
                            <input
                                type="date"
                                value={newVisit.date}
                                onChange={(e) => setNewVisit({ ...newVisit, date: e.target.value })}
                                className="border p-2 mr-2 rounded"
                                placeholder="Fecha"
                            />
                            <input
                                type="text"
                                value={newVisit.description}
                                onChange={(e) => setNewVisit({ ...newVisit, description: e.target.value })}
                                className="border p-2 rounded w-1/2"
                                placeholder="Descripción de la visita"
                            />
                            <button onClick={addVisit} className="ml-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700">
                                Añadir Visita
                            </button>
                            {error && <div className="text-red-500 mt-2">{error}</div>}
                        </div>
                    )}

                    <div className="max-h-96 overflow-y-auto">
                        {isLoading ? (
                            <div className="text-center">Cargando visitas...</div>
                        ) : visits.length > 0 ? (
                            <table className="min-w-full bg-white border border-gray-300 text-sm">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 border-b">Fecha</th>
                                        <th className="px-4 py-2 border-b">Descripción</th>
                                        <th className="px-4 py-2 border-b">Estado</th>
                                        <th className="px-4 py-2 border-b">Creado por</th>
                                        <th className="px-4 py-2 border-b">Completado por</th>
                                        <th className="px-4 py-2 border-b">Mensaje de completado</th>
                                        {!showCompleted && <th className="px-4 py-2 border-b">Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map((visit) => (
                                        <tr key={visit.id} className="border-b">
                                            <td className="px-4 py-2">{new Date(visit.fecha).toLocaleDateString()}</td>
                                            <td className="px-4 py-2">{visit.descripcion}</td>
                                            <td className="px-4 py-2">{visit.estado === 'completada' ? 'Completada' : 'Pendiente'}</td>
                                            <td className="px-4 py-2">{visit.creado_por}</td>
                                            <td className="px-4 py-2">{visit.completado_por || '-'}</td>
                                            <td className="px-4 py-2">{visit.mensaje_completado || '-'}</td>
                                            {!showCompleted && visit.estado === 'pendiente' && (
                                                <td className="px-4 py-2 text-center">
                                                    <button
                                                        onClick={() => setVisitToComplete(visit.id)}
                                                        className="px-4 py-1 bg-green-500 text-white rounded hover:bg-green-700 mr-2"
                                                    >
                                                        Completar
                                                    </button>
                                                    <button
                                                        onClick={() => deleteVisit(visit.id)}
                                                        className="px-4 py-1 bg-red-500 text-white rounded hover:bg-red-700"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div>No hay visitas disponibles para este cliente.</div>
                        )}
                    </div>

                    {visitToComplete && (
                        <div className="mt-4">
                            <h3 className="font-bold mb-2">Completar Visita</h3>
                            <textarea
                                value={completionMessage}
                                onChange={(e) => setCompletionMessage(e.target.value)}
                                className="border p-2 w-full rounded mb-2"
                                placeholder="Mensaje de completado"
                            ></textarea>
                            <button onClick={() => completeVisit(visitToComplete)} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700">
                                Marcar como Completada
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )
    );
}

export default VisitModal;
