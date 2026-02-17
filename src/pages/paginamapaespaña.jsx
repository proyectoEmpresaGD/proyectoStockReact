import { useEffect, useState } from 'react';
import SpainMap from '../components/analitica/MapaEspaña';
import PageShell from '../common/PageShell.jsx';
const PaginaMapaEspaña = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(false);
    }, []);

    return (
        <PageShell maxWidth="max-w-5xl" className="mt-16 sm:mt-20">
            {loading ? (
                <div className="text-center text-slate-600">Cargando mapa...</div>
            ) : (
                <SpainMap />
            )}
        </PageShell>
    );
};

export default PaginaMapaEspaña;
