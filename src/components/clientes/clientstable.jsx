// src/components/clientes/ClientTable.jsx
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';
import { useAuthContext } from '../../Auth/AuthContext';
import VisitModal from './VisitModal';

export default function ClientTable({
    clients,
    handleClientClick,
    clientBillings,
    getClientColor,
    setClients
}) {
    const { user } = useAuthContext();
    const [tooltip, setTooltip] = useState({
        show: false,
        content: '',
        x: 0,
        y: 0,
        clientId: null
    });
    const [vista, setVista] = useState('tabla');
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);

    const showTooltip = (billing, clientId, e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            show: true,
            content: `€ ${billing.toFixed(2)}`,
            x: rect.left + rect.width / 2,
            y: rect.top - 8,
            clientId
        });
    };
    const hideTooltip = () =>
        setTooltip({ show: false, content: '', x: 0, y: 0, clientId: null });

    const openVisitModal = (clientId) => {
        setSelectedClientId(clientId);
        setVisitModalVisible(true);
    };
    const closeVisitModal = () => {
        setVisitModalVisible(false);
        setSelectedClientId(null);
    };

    return (
        <div className="relative shadow-md rounded-lg">
            <div className="flex justify-end p-2">
                <button
                    onClick={() =>
                        setVista((prev) =>
                            prev === 'auto' ? 'tabla' : prev === 'tabla' ? 'carta' : 'tabla'
                        )
                    }
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded text-sm"
                >
                    Vista: {vista}
                </button>
            </div>
            {/* tabla Table */}
            <div className={`
          overflow-x-auto max-h-[60vh] transition-all duration-500 ease-in-out
          ${vista === 'tabla' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none h-0'}
        `}>
                <table className="min-w-full bg-white text-sm">
                    <thead className="sticky top-0 bg-gray-100 border-b z-10">
                        <tr>
                            <th className="px-3 py-2">Estado</th>
                            <th className="px-3 py-2 text-left">Código</th>
                            <th className="px-3 py-2 text-left">Nombre</th>
                            <th className="px-3 py-2 text-left">Localidad</th>
                            <th className="px-3 py-2 text-center">Últ. Visita</th>
                            <th className="px-3 py-2 text-center">Visitas</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((client) => {
                            const billing = clientBillings[client.codclien] || 0;
                            return (
                                <tr
                                    key={client.codclien}
                                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"

                                >
                                    <td className="px-3 py-2 text-center relative" >
                                        <span
                                            className={`inline-block w-3 h-3 rounded-full ${getClientColor(
                                                billing
                                            )}`}
                                            onMouseEnter={(e) => showTooltip(billing, client.codclien, e)}
                                            onMouseLeave={hideTooltip}
                                            aria-label={`Facturación ${billing.toFixed(2)}€`}
                                        />
                                        {tooltip.show && tooltip.clientId === client.codclien && (
                                            <div
                                                className="absolute bg-black text-white text-xs rounded py-1 px-2 pointer-events-none animate-fadeIn"
                                                style={{
                                                    bottom: '100%',
                                                    zIndex: '40',
                                                    left: '60%',
                                                    transform: 'translateX(-50%)',
                                                    marginBottom: '3px',
                                                    whiteSpace: 'nowrap'
                                                }}

                                            >
                                                {tooltip.content}
                                            </div>
                                        )}
                                    </td>
                                    <td
                                        className="px-3 py-2"
                                        onClick={() => handleClientClick(client.codclien)}
                                    >
                                        {client.codclien}
                                    </td>
                                    <td
                                        className="px-3 py-2 break-words"
                                        onClick={() => handleClientClick(client.codclien)}
                                    >
                                        {client.razclien}
                                    </td>
                                    <td
                                        className="px-3 py-2"
                                        onClick={() => handleClientClick(client.codclien)}
                                    >
                                        {client.localidad}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {client.ultimaVisita
                                            ? new Date(client.ultimaVisita).toLocaleDateString()
                                            : 'Sin visitas'}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {user &&
                                            (user.role === 'comercial' || user.role === 'admin') && (
                                                <button
                                                    onClick={() => openVisitModal(client.codclien)}
                                                    aria-label="Ver/Agregar visita"
                                                    className="flex items-center justify-center text-blue-500 hover:text-blue-700 transition-colors"
                                                >
                                                    <FontAwesomeIcon icon={faPlane} size="lg" />
                                                </button>
                                            )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* carta Cards */}
            <div className={`
          space-y-4 overflow-y-auto max-h-[60vh] p-2 transition-all duration-500 ease-in-out
          ${vista === 'carta' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none h-0'}
        `}
            >
                {clients.map((client) => {
                    const billing = clientBillings[client.codclien] || 0;
                    return (
                        <div
                            onClick={() => handleClientClick(client.codclien)}
                            key={client.codclien}
                            className="bg-white p-4 rounded-lg cursor-pointer cur shadow hover:shadow-md transition"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-2">
                                    <span
                                        className={`relative inline-block w-3 h-3 rounded-full ${getClientColor(billing)}`}
                                        onMouseEnter={() =>
                                            setTooltip({
                                                show: true,
                                                content: `€ ${billing.toFixed(2)}`,
                                                clientId: client.codclien
                                            })
                                        }
                                        onMouseLeave={hideTooltip}
                                        aria-label={`Facturación ${billing.toFixed(2)}€`}
                                    >
                                        {/* Tooltip encima del punto */}
                                        {tooltip.show && tooltip.clientId === client.codclien && (
                                            <div
                                                className="absolute bg-black text-white text-xs rounded py-1 px-2 pointer-events-none animate-fadeIn"
                                                style={{
                                                    bottom: '100%',
                                                    left: '100%',
                                                    transform: 'translateX(-20%)',
                                                    marginBottom: '6px',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {tooltip.content}
                                            </div>
                                        )}
                                    </span>
                                    <span
                                        className="text-lg font-semibold"
                                        onClick={() => handleClientClick(client.codclien)}
                                    >
                                        {client.razclien}
                                    </span>
                                </span>

                                {user &&
                                    (user.role === 'comercial' || user.role === 'admin') && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); // Evita que se dispare el onClick del contenedor
                                                openVisitModal(client.codclien);
                                            }}
                                            aria-label="Ver/Agregar visita"
                                            className="text-blue-500 hover:text-blue-700 transition"
                                        >
                                            <FontAwesomeIcon icon={faPlane} size="lg" />
                                        </button>
                                    )}
                            </div>
                            <p
                                className="text-sm text-gray-700 mb-1 cursor-pointer break-words"
                                onClick={() => handleClientClick(client.codclien)}
                            >
                                <strong>Código:</strong> {client.codclien}
                            </p>
                            <p className="text-sm text-gray-700 mb-1">
                                <strong>Localidad:</strong> {client.localidad}
                            </p>
                            <p className="text-sm text-gray-700 mb-1">
                                <strong>Últ. Visita:</strong>{' '}
                                {client.ultimaVisita
                                    ? new Date(client.ultimaVisita).toLocaleDateString()
                                    : 'Sin visitas'}
                            </p>
                            <p className="text-sm text-gray-700">
                                <strong>Facturación:</strong> €{billing.toFixed(2)}
                            </p>
                        </div>
                    );
                })}
            </div>

            {visitModalVisible && (
                <VisitModal
                    modalVisible={visitModalVisible}
                    selectedClientId={selectedClientId}
                    closeModal={closeVisitModal}
                    updateLastVisitDate={(id, date) => {
                        setClients((prev) =>
                            prev.map((c) =>
                                c.codclien === id ? { ...c, ultimaVisita: date } : c
                            )
                        );
                    }}
                />
            )}
        </div>
    );
}
