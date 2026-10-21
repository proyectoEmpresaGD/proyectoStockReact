import TranslatedText from '../i18n/TranslatedText.jsx';
import { useEffect, useState } from 'react';
import MapaClientes from '../components/analitica/MapaClientes';
import PageShell from '../common/PageShell.jsx';
const PaginaMapaClientes = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(false);
    }, []);

    return (
        <PageShell maxWidth="max-w-7xl" className="mt-16 sm:mt-20">
            {loading ? (
                <div className="text-center text-slate-600"><TranslatedText>Cargando mapa...</TranslatedText></div>
            ) : (
                <MapaClientes />
            )}
        </PageShell>
    );
};

export default PaginaMapaClientes;
