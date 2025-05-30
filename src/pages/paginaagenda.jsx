import React from 'react';
import dynamic from 'next/dynamic';

// Importación dinámica para cargar Agenda únicamente en el cliente (deshabilita SSR)
const Agenda = dynamic(() => import('../components/agenda/Agenda'), { ssr: false });

const AgendaPage = () => {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="container mx-auto bg-white p-6 border rounded shadow-lg max-w-screen-lg w-full mt-24 m-8">
                <Agenda />
            </div>
        </div>
    );
};

export default AgendaPage;
