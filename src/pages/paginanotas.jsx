// src/pages/paginanotas.jsx
import React, { Suspense, lazy } from 'react';

const Notas = lazy(() => import('../components/notas/notas'));

export default function NotasPage() {
    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center px-3 py-6 sm:px-6">
            <div className="notas-page-wrapper mx-auto w-full max-w-6xl bg-white p-4 sm:p-6 border rounded shadow-lg mt-16 sm:mt-24">
                <Suspense
                    fallback={
                        <div className="flex h-48 items-center justify-center rounded border border-indigo-200 bg-indigo-50 text-indigo-700 shadow">
                            Cargando notas...
                        </div>
                    }
                >
                    <Notas />
                </Suspense>
            </div>
        </div>
    );
}
