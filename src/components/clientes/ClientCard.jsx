import React from 'react';
import { FiMapPin, FiCalendar } from 'react-icons/fi';

export default function ClientCard({ client, billing, colorClass, onClick }) {
    return (
        <div
            onClick={onClick}
            className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden flex flex-col"
        >
            <div className="p-4 flex items-center gap-3">
                <span
                    className={`inline-block w-3 h-3 rounded-full ${colorClass}`}
                    aria-hidden="true"
                />
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 truncate">{client.razclien}</h3>
                    <p className="text-sm text-gray-500 truncate">#{client.codclien}</p>
                </div>
            </div>
            <div className="px-4 pb-4 space-y-2 flex-1">
                <div className="flex items-center text-sm text-gray-600 gap-1">
                    <FiMapPin /> <span className="truncate">{client.localidad}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600 gap-1">
                    <FiCalendar />{' '}
                    <span>
                        {client.ultimaVisita
                            ? new Date(client.ultimaVisita).toLocaleDateString()
                            : 'Sin visitas'}
                    </span>
                </div>
            </div>
            <div className="bg-gray-50 px-4 py-2 text-sm text-right text-gray-700">
                Facturación: <span className="font-medium">€{billing.toFixed(2)}</span>
            </div>
        </div>
    );
}
