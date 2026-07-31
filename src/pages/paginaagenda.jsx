// src/pages/paginaagenda.jsx
import React, { Suspense, lazy } from 'react';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import { CalendarDays } from 'lucide-react';
// Importación dinámica para cargar Agenda únicamente en el cliente
const Agenda = lazy(() => import('../components/agenda/Agenda'));

const AgendaPage = () => {
    return (
        <PageShell maxWidth="max-w-[1400px]" className="agenda-modern mt-16 sm:mt-20">
            <PageHeader
                eyebrow="Relación comercial"
                title="Agenda de visitas"
                description="Planifica, filtra y revisa la actividad comercial desde ordenador, tablet o móvil."
                icon={CalendarDays}
            />
            <div className="agenda-page-wrapper mt-6">
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
