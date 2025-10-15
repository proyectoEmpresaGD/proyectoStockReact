// src/pages/paginanotas.jsx
import React from 'react';
import dynamic from 'next/dynamic';

const Notas = dynamic(() => import('../components/notas/notas'), { ssr: false });

export default function NotasPage() {
    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center px-3 py-6 sm:px-6">
            <div className="notas-page-wrapper mx-auto w-full max-w-6xl bg-white p-4 sm:p-6 border rounded shadow-lg mt-16 sm:mt-24">
                <Notas />
            </div>
        </div>
    );
}
