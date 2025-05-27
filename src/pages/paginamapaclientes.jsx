import { useEffect, useState } from 'react';
import MapaClientes from '../components/analitica/MapaClientes';

const PaginaMapaClientes = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(false);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-300 to-indigo-400 flex flex-col items-center md:px-4 px-2 py-6">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-24 w-full">


                {loading ? (
                    <div className="text-center">Cargando mapa...</div>
                ) : (
                    <MapaClientes />
                )}
            </div>
        </div>
    );
};

export default PaginaMapaClientes;
