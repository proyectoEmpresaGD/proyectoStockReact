import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';

function ClientTable({ clients, handleClientClick, handleVisitClick }) {
    return (
        <div className="overflow-auto">
            <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-1 py-1 border-b">Código</th>
                        <th className="px-1 py-1 border-b">Nombre</th>
                        <th className="px-1 py-1 border-b">Localidad</th>
                        <th className="px-1 py-1 border-b">Visitas</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map(client => (
                        <tr key={client.codclien} className="border-b hover:bg-gray-100 cursor-pointer">
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
