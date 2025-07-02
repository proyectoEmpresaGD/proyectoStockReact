// src/components/agenda/DayEventsModal.jsx
import React from 'react';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';

export default function DayEventsModal({
    date,
    visits,
    onClose,
    onSelect,
    onNew
}) {
    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-lg w-full max-w-md md:max-w-lg overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center border-b px-4 py-3">
                    <h2 className="text-lg font-semibold">
                        {format(date, "EEEE, d 'de' MMMM yyyy", { locale: es })}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-600 hover:text-gray-900 text-2xl leading-none"
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>

                {/* Lista de visitas */}
                <div className="p-4 max-h-80vh overflow-y-auto space-y-3">
                    {visits.length === 0 ? (
                        <p className="text-gray-500">No hay visitas programadas.</p>
                    ) : (
                        visits.map(v => {
                            const time = v.start instanceof Date && !isNaN(v.start)
                                ? format(v.start, 'HH:mm', { locale: es })
                                : '';
                            const client = v.cliente_nombre || v.cliente || 'Sin asignar';
                            return (
                                <div
                                    key={v.id}
                                    onClick={() => onSelect(v)}
                                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                >
                                    <div>
                                        <div className="font-medium text-sm">{v.descripcion}</div>
                                        <div className="text-xs text-gray-500">
                                            {time} &mdash; {client}
                                        </div>
                                    </div>
                                    <div className="text-gray-400 text-xl">›</div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer con Nueva visita */}
                <div className="border-t px-4 py-3 flex justify-end">
                    <button
                        onClick={onNew}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                    >
                        ➕ Nueva visita
                    </button>
                </div>
            </div>
        </div>
    );
}
