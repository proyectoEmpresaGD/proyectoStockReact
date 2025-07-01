import React from 'react';

export default function CustomToolbar({
    label,
    view,
    onView,
    goBack,
    goToday,
    goNext,
}) {
    return (
        <div className="bg-white flex flex-col lg:flex-row items-center justify-between p-4 shadow">
            {/* Navegación */}
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
                <button onClick={goToday}
                    className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    Hoy
                </button>
                <button onClick={goBack}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
                    ‹
                </button>
                <button onClick={goNext}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
                    ›
                </button>
                <span className="ml-4 font-semibold text-lg">{label}</span>
            </div>

            {/* Selector de vista */}
            <div className="flex gap-2">
                <button
                    onClick={() => onView('month')}
                    className={`px-3 py-1 rounded ${view === 'month' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
                    Mes
                </button>
                <button
                    onClick={() => onView('week')}
                    className={`px-3 py-1 rounded ${view === 'week' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
                    Semana
                </button>
                <button
                    onClick={() => onView('day')}
                    className={`px-3 py-1 rounded ${view === 'day' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
                    Día
                </button>
            </div>
        </div>
    );
}
