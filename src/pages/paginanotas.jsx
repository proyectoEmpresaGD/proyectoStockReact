// src/pages/paginanotas.jsx
import React from 'react';
import dynamic from 'next/dynamic';

const Notas = dynamic(() => import('../components/notas/Notas'), { ssr: false });

export default function NotasPage() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4">
            <div className="container mx-auto bg-white p-6 border rounded shadow-lg max-w-screen-lg w-full mt-24">
                <Notas />
            </div>
        </div>
    );
}
