import React from 'react';
import dynamic from 'next/dynamic';

// Importación dinámica para cargar Agenda únicamente en el cliente (deshabilita SSR)
const Agenda = dynamic(() => import('../components/agenda/Agenda'), { ssr: false });

const AgendaPage = () => {
    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center px-3 py-6 sm:px-6">
            <div className="agenda-page-wrapper mx-auto bg-white p-4 sm:p-6 border rounded shadow-lg w-full max-w-6xl mt-16 sm:mt-24">
                <Agenda />
            </div>
        </div>
    );
};

export default AgendaPage;
