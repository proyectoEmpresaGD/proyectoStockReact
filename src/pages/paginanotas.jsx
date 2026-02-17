// src/pages/paginanotas.jsx
import React, { Suspense, lazy } from 'react';
import PageShell from '../common/PageShell.jsx';
const Notas = lazy(() => import('../components/notas/notas'));

export default function NotasPage() {
    return (
        <PageShell maxWidth="max-w-6xl" className="mt-16 sm:mt-20">
            <div className="notas-page-wrapper">
                <Suspense
                    fallback={
                        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm">
                            Cargando notas...
                        </div>
                    }
                >
                    <Notas />
                </Suspense>
            </div>
        </PageShell>
    );
}
