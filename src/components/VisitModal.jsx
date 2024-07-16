import { useEffect, useState } from 'react';

function VisitModal({ modalVisible, selectedClientId, closeModal }) {
    const [visits, setVisits] = useState([]);

    useEffect(() => {
        if (modalVisible && selectedClientId) {
            fetchVisits(selectedClientId);
        }
    }, [modalVisible, selectedClientId]);

    const fetchVisits = async (clientId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/client/${clientId}`);
            if (response.ok) {
                const data = await response.json();
                setVisits(data);
            } else {
                console.error('Failed to fetch visits');
            }
        } catch (error) {
            console.error('Error fetching visits:', error);
        }
    };

    const getColor = (date) => {
        const visitDate = new Date(date);
        const now = new Date();
        return visitDate < now ? 'bg-red-500' : 'bg-green-500';
    };

    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
                <div className="bg-white p-4 rounded shadow-lg max-w-4xl w-full relative">
                    <h2 className="text-xl font-bold mb-4">Visitas del Cliente</h2>
                    <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 w-8 hover:text-gray-800"><img src="https://cjmw.eu/ImagenesTelasCjmw/Iconos/close.svg" alt="" /></button>
                    <div className="max-h-96 overflow-y-auto">
                        <table className="min-w-full bg-white border border-gray-300 text-sm">
                            <thead className="bg-gray-200">
                                <tr>
                                    <th className="px-4 py-2 border-b">Fecha</th>
                                    <th className="px-4 py-2 border-b">Descripción</th>
                                    <th className="px-4 py-2 border-b">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visits.map((visit, index) => (
                                    <tr key={index} className="border-b">
                                        <td className="px-4 py-2">{visit.date}</td>
                                        <td className="px-4 py-2">{visit.description}</td>
                                        <td className="px-4 py-2">
                                            <span className={`w-4 h-4 inline-block rounded-full ${getColor(visit.date)}`}></span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )
    );
}

export default VisitModal;
