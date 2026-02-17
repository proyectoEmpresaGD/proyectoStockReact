// src/pages/paginaagenda.jsx
import React, { Suspense, lazy } from 'react';
import PageShell from '../common/PageShell.jsx';
// Importación dinámica para cargar Agenda únicamente en el cliente
const Agenda = lazy(() => import('../components/agenda/Agenda'));

const AgendaPage = () => {
    return (
        <PageShell maxWidth="max-w-6xl" className="mt-16 sm:mt-20">
            <div className="agenda-page-wrapper">
                <Suspense
                    fallback={
                        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm">
                            Cargando agenda...
                        </div>
                    }
                >
                    <Agenda />
                </Suspense>
            </div>
        </PageShell>
    );
};

export default AgendaPage;
