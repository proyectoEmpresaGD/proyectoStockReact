// src/components/agenda/UpcomingEventsModal.jsx
import React from 'react';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';

export default function UpcomingEventsModal({ eventos, onClose }) {
    const now = new Date();
    const twoMonths = new Date();
    twoMonths.setMonth(now.getMonth() + 2);

    const próximos = eventos
        .filter(e => e.start >= now && e.start <= twoMonths)
        .sort((a, b) => a.start - b.start);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
                <header className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">📅 Eventos próximos (2 meses)</h2>
                    <button onClick={onClose} className="text-2xl">&times;</button>
                </header>

                {próximos.length === 0 ? (
                    <p className="text-gray-500">No hay eventos próximos.</p>
                ) : (
                    <ul className="space-y-2">
                        {próximos.map((e, i) => (
                            <li key={i} className="p-2 border rounded">
                                <p className="font-medium">{format(e.start, 'PPPpp', { locale: es })}</p>
                                <p>{e.descripcion}</p>
                                {e.cliente_nombre && <p className="text-xs text-gray-500">👤 {e.cliente_nombre}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
