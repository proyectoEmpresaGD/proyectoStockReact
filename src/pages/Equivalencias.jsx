import { useRef } from 'react';
import EquivalenciasTable from '../components/equivalencias/EquivalenciasTable';
import PageShell from '../common/PageShell.jsx';
function Equivalencias() {
    const searchBarRef = useRef(null);

    return (

        <PageShell maxWidth="max-w-5xl" className="mt-16 sm:mt-20">
            <h1 className="mb-4 text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                Gestión de Equivalencias
            </h1>
            <p className="mb-6 text-center text-sm text-slate-500 md:text-base">
                Busca y gestiona las equivalencias de productos de manera rápida y eficiente.
            </p>

            <div ref={searchBarRef}>
                <EquivalenciasTable />
            </div>
        </PageShell>
    );
}

export default Equivalencias;
