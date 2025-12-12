// src/pages/paginaagenda.jsx
import React, { Suspense, lazy } from 'react';

// Importación dinámica para cargar Agenda únicamente en el cliente
const Agenda = lazy(() => import('../components/agenda/Agenda'));

const AgendaPage = () => {
    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center px-3 py-6 sm:px-6">
            <div className="agenda-page-wrapper mx-auto bg-white p-4 sm:p-6 border rounded shadow-lg w-full max-w-6xl mt-16 sm:mt-24">
                <Suspense
                    fallback={
                        <div className="flex h-48 items-center justify-center rounded border border-indigo-200 bg-indigo-50 text-indigo-700 shadow">
                            Cargando agenda...
                        </div>
                    }
                >
                    <Agenda />
                </Suspense>
            </div>
        </div>
    );
};

export default AgendaPage;
