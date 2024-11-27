import { useRef } from 'react';
import EquivalenciasTable from '../components/equivalencias/EquivalenciasTable';

function Equivalencias() {
    const searchBarRef = useRef(null);

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6 overflow-y-auto">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-24">
                <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-gray-700">
                    Gestión de Equivalencias
                </h1>
                <p className="text-lg md:text-xl mb-6 text-center text-gray-600">
                    Busca y gestiona las equivalencias de productos de manera rápida y eficiente.
                </p>

                {/* Tabla de Equivalencias */}
                <div ref={searchBarRef}>
                    <EquivalenciasTable />
                </div>
            </div>
        </div>
    );
}

export default Equivalencias;
