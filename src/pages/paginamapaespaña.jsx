import { useEffect, useState } from 'react';
import SpainMap from '../components/analitica/MapaEspaña';

const PaginaMapaEspaña = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(false);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center md:px-4 px-2 py-6">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-24 w-full">
                {loading ? (
                    <div className="text-center">Cargando mapa...</div>
                ) : (
                    <SpainMap />
                )}
            </div>
        </div>
    );
};

export default PaginaMapaEspaña;
