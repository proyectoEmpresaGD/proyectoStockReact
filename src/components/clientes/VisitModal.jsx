import { useEffect, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext';

function VisitModal({ modalVisible, selectedClientId, closeModal, updateLastVisitDate }) {
    const { token, user } = useAuthContext();
    const [visits, setVisits] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newVisit, setNewVisit] = useState({ date: '', time: '', description: '', assignedTo: '' });
    const [commercialUsers, setCommercialUsers] = useState([]);
    const [error, setError] = useState(null);
    const [completionMessage, setCompletionMessage] = useState('');
    const [visitToComplete, setVisitToComplete] = useState(null);
    const [showCompleted, setShowCompleted] = useState(false);

    useEffect(() => {
        if (modalVisible && selectedClientId) {
            fetchVisits(selectedClientId);
            fetchCommercialUsers();
        }
    }, [modalVisible, selectedClientId, showCompleted]);

    const fetchVisits = async (clientId) => {
        setIsLoading(true);
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${clientId}?showCompleted=${showCompleted}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
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

    const fetchCommercialUsers = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/users/commercial`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setCommercialUsers(data);
            } else {
                console.error('Failed to fetch commercial users');
            }
        } catch (error) {
            console.error('Error fetching commercial users:', error);
        }
    };

    const generateEmailContent = (visit) => `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="text-align: center; color: #0044cc; font-size: 24px;">Detalles de la Visita</h2>
        <p style="text-align: center; color: #555; font-size: 16px;">¡Se ha programado una nueva visita para el cliente!</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f4f4f4;">
            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Fecha</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${new Date(visit.date).toLocaleString()}</td>
          </tr>
          <tr>
            <th style="padding: 10px; text-align: left; background-color: #f4f4f4; border: 1px solid #ddd;">Cliente</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${visit.cliente_id}</td>
          </tr>
          <tr>
            <th style="padding: 10px; text-align: left; background-color: #f4f4f4; border: 1px solid #ddd;">Descripción</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${visit.description}</td>
          </tr>
          <tr>
            <th style="padding: 10px; text-align: left; background-color: #f4f4f4; border: 1px solid #ddd;">Creado por</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${visit.created_by}</td>
          </tr>
          <tr>
            <th style="padding: 10px; text-align: left; background-color: #f4f4f4; border: 1px solid #ddd;">Asignado a</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${visit.assigned_to}</td>
          </tr>
        </table>

        <p style="margin-top: 20px; color: #555; font-size: 14px;">
          Por favor, asegúrate de que los detalles son correctos y sigue las instrucciones de la visita.
        </p>

        <div style="text-align: center; margin-top: 20px;">
          <a href="https://www.example.com" style="background-color: #0044cc; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-size: 16px;">
            Ver en el Sistema
          </a>
        </div>
      </div>
    `;

    const addVisit = async () => {
        if (!newVisit.date || !newVisit.time || !newVisit.description || !newVisit.assignedTo) {
            setError("Todos los campos son obligatorios.");
            return;
        }

        const dateTime = `${newVisit.date}T${newVisit.time}`;
        const assignedTo = parseInt(newVisit.assignedTo, 10);

        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${selectedClientId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        date: dateTime,
                        description: newVisit.description,
                        created_by: user.id,
                        assigned_to: assignedTo
                    })
                }
            );
            if (response.ok) {
                setNewVisit({ date: '', time: '', description: '', assignedTo: '' });
                setError(null);
                fetchVisits(selectedClientId);
                updateLastVisitDate(selectedClientId, newVisit.date);

                const emailContent = generateEmailContent({
                    date: dateTime,
                    cliente_id: selectedClientId,
                    description: newVisit.description,
                    created_by: user.username,
                    assigned_to: assignedTo
                });
                console.log("Contenido del correo:", emailContent);
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
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/${visitId}/complete`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ mensaje_completado: completionMessage, completed_by: user.id })
                }
            );
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
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/visits/${visitId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                <div className="bg-white p-4 rounded shadow-lg max-w-full md:max-w-4xl w-full relative overflow-y-auto max-h-[90vh]">
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
                        <div className="mb-4 flex flex-wrap gap-2">
                            <input
                                type="date"
                                value={newVisit.date}
                                onChange={(e) => setNewVisit({ ...newVisit, date: e.target.value })}
                                className="border p-2 rounded flex-1 min-w-[120px]"
                            />
                            <input
                                type="time"
                                value={newVisit.time}
                                onChange={(e) => setNewVisit({ ...newVisit, time: e.target.value })}
                                className="border p-2 rounded flex-1 min-w-[120px]"
                            />
                            <input
                                type="text"
                                value={newVisit.description}
                                onChange={(e) => setNewVisit({ ...newVisit, description: e.target.value })}
                                className="border p-2 rounded flex-1"
                                placeholder="Descripción de la visita"
                            />
                            <select
                                value={newVisit.assignedTo}
                                onChange={(e) => setNewVisit({ ...newVisit, assignedTo: e.target.value })}
                                className="border p-2 rounded flex-1 min-w-[150px]"
                            >
                                <option value="">Seleccionar Comercial</option>
                                {commercialUsers.map(user => (
                                    <option key={user.id} value={user.id}>{user.username}</option>
                                ))}
                            </select>
                            <button onClick={addVisit} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700">
                                Añadir Visita
                            </button>
                            {error && <div className="text-red-500 mt-2 w-full">{error}</div>}
                        </div>
                    )}

                    <div className="max-h-[60vh] overflow-y-auto">
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
                                            <td className="px-4 py-2">{new Date(visit.fecha).toLocaleString()}</td>
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
