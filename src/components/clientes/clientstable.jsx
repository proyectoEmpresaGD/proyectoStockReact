import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';
import { useAuthContext } from '../../Auth/AuthContext'; // Importar el contexto de autenticación

function ClientTable({ clients, handleClientClick, handleVisitClick, clientBillings, getClientColor }) {
    const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0, clientId: null });
    const { user } = useAuthContext(); // Obtener la información del usuario

    const handleMouseEnter = (billing, clientId, event) => {
        const content = `Facturación: ${billing.toFixed(2)} €`;
        const rect = event.target.getBoundingClientRect();
        setTooltip({
            show: true,
            content,
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            clientId
        });
    };

    const handleMouseLeave = () => {
        setTooltip({ show: false, content: '', x: 0, y: 0, clientId: null });
    };

    return (
        <div className="relative overflow-x-auto overflow-y-auto shadow-md rounded-lg md:max-h-[60%] max-h-[45vh]">
            <table className=" md:min-w-[100%] bg-white border border-gray-300 rounded-lg text-sm">
                <thead className="bg-gray-100 text-xs md:text-sm">
                    <tr>
                        <th className="md:px-4 px-1 py-2 border-b text-center">Estado</th>
                        <th className="md:px-4 px-1 py-2 border-b text-left">Código</th>
                        <th className="md:px-4 px-1 py-2 border-b text-left">Nombre</th>
                        <th className="md:px-4 px-1 py-2 border-b text-left">Localidad</th>
                        <th className="md:px-4 px-1 py-2 border-b text-center">Visitas</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map(client => (
                        <tr key={client.codclien} className="border-b hover:bg-gray-50 cursor-pointer transition-colors duration-200 text-xs md:text-sm">
                            <td className="md:px-4 px-1 py-2 text-center relative text-xs md:text-sm">
                                <div
                                    className={`w-4 h-4 rounded-full ${getClientColor(clientBillings[client.codclien] || 0)} mx-auto`}
                                    onMouseEnter={(e) => handleMouseEnter(clientBillings[client.codclien] || 0, client.codclien, e)}
                                    onMouseLeave={handleMouseLeave}
                                ></div>
                                {tooltip.show && tooltip.clientId === client.codclien && (
                                    <div
                                        className="absolute bg-black text-white text-xs rounded py-1 px-2 mt-1 z-50"
                                        style={{ top: '-120%', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
                                    >
                                        {tooltip.content}
                                    </div>
                                )}
                            </td>
                            <td className="px-1 md:px-4 py-2 text-left" onClick={() => handleClientClick(client.codclien)}>{client.codclien}</td>
                            <td className="px-1 md:px-4 py-2 text-left break-words" onClick={() => handleClientClick(client.codclien)}>{client.razclien}</td>
                            <td className="px-1 md:px-4 py-2 text-left max-h-[45vh]" onClick={() => handleClientClick(client.codclien)}>{client.localidad}</td>
                            <td className="px-4 py-2 text-center">
                                {user && (user.role === 'comercial' || user.role === 'admin') && (
                                    <button onClick={() => handleVisitClick(client.codclien)}>
                                        <FontAwesomeIcon icon={faPlane} size="lg" className="text-blue-500 hover:text-blue-700 transition-colors duration-200" />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default ClientTable;
