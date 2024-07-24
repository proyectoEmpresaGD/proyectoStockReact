import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';

function ClientTable({ clients, handleClientClick, handleVisitClick, clientBillings, getClientColor }) {
    const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0, clientId: null });

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
        <div className="relative overflow-auto">
            <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-1 py-1 border-b text-center">Estado</th>
                        <th className="px-1 py-1 border-b">Código</th>
                        <th className="px-1 py-1 border-b">Nombre</th>
                        <th className="px-1 py-1 border-b">Localidad</th>
                        <th className="px-1 py-1 border-b">Visitas</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map(client => (
                        <tr key={client.codclien} className="border-b hover:bg-gray-100 cursor-pointer">
                            <td className="px-1 py-1 text-center relative">
                                <div
                                    className={`w-4 h-4 rounded-full ${getClientColor(clientBillings[client.codclien] || 0)} mx-auto`}
                                    onMouseEnter={(e) => handleMouseEnter(clientBillings[client.codclien] || 0, client.codclien, e)}
                                    onMouseLeave={handleMouseLeave}
                                ></div>
                                {tooltip.show && tooltip.clientId === client.codclien && (
                                    <div
                                        className="absolute bg-black text-white text-xs rounded py-1 px-2 mt-1 left-1/2 transform -translate-x-1/2 z-50"
                                        style={{ top: '100%' }}
                                    >
                                        {tooltip.content}
                                    </div>
                                )}
                            </td>
                            <td className="px-1 py-1" onClick={() => handleClientClick(client.codclien)}>{client.codclien}</td>
                            <td className="px-1 py-1" onClick={() => handleClientClick(client.codclien)}>{client.razclien}</td>
                            <td className="px-1 py-1" onClick={() => handleClientClick(client.codclien)}>{client.localidad}</td>
                            <td className="px-1 py-1 text-center">
                                <button onClick={() => handleVisitClick(client.codclien)}>
                                    <FontAwesomeIcon icon={faPlane} size="lg" className="text-blue-500 hover:text-blue-700" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default ClientTable;
