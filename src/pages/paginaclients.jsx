import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { FiLoader, FiGrid, FiList } from 'react-icons/fi';
import { useAuthContext } from '../Auth/AuthContext';
import { provinces, countryCodes } from '../Constants/constants';
import SearchBar from '../components/clientes/SearchBarClients';
import ClientTable from '../components/clientes/clientstable.jsx';
import ClientCard from '../components/clientes/ClientCard';
import ClientModal from '../components/clientes/modal/ClientModal';
import PaginationControls from '../components/PaginationControls';

export default function Clients() {
    const { token } = useAuthContext();
    const [searchParams, setSearchParams] = useSearchParams();

    // datos principales
    const [clients, setClients] = useState([]);
    const [clientBillings, setClientBillings] = useState({});
    const [loading, setLoading] = useState(false);

    // filtros / paginación / búsqueda
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [totalClients, setTotalClients] = useState(0);

    const [selectedCountry, setSelectedCountry] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [sortByBilling, setSortByBilling] = useState(false);

    // vista ('table' sólo en móvil)
    const [viewMode, setViewMode] = useState('table');

    // modal detalle
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);

    // leer params al montar
    useEffect(() => {
        const cp = searchParams.get('codpais');
        const cv = searchParams.get('codprov');
        if (cp) setSelectedCountry(cp);
        if (cv) {
            const prov = provinces.find(p => p.value === cv);
            if (prov) setSelectedProvince(prov);
        }
    }, [searchParams]);

    // fetch clientes + facturaciones
    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                let url = `${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${currentPage}&limit=${itemsPerPage}`;
                if (sortByBilling) url = url.replace('/api/clients', '/api/clients/billing');
                if (searchTerm) url += `&query=${encodeURIComponent(searchTerm)}`;
                if (selectedCountry) url += `&codpais=${selectedCountry}`;
                if (selectedProvince) url += `&codprovi=${selectedProvince.value}`;

                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                setClients(data.clients || []);
                setTotalClients(data.total || 0);

                // facturaciones
                const map = {};
                await Promise.all(
                    (data.clients || []).map(async c => {
                        const r2 = await fetch(
                            `${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${c.codclien}`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (r2.ok) {
                            const pd = await r2.json();
                            map[c.codclien] = pd.reduce((s, p) => {
                                let imp = +p.importe || 0;
                                [p.dt1, p.dt2, p.dt3].forEach(d => { if (d > 0) imp *= 1 - d / 100; });
                                return s + Math.max(imp, 0);
                            }, 0);
                        }
                    })
                );
                setClientBillings(map);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [
        token,
        currentPage,
        itemsPerPage,
        searchTerm,
        selectedCountry,
        selectedProvince,
        sortByBilling,
    ]);

    const handleClearFilters = () => {
        setSearchTerm('');
        setSelectedCountry(null);
        setSelectedProvince(null);
        setSortByBilling(false);
        setCurrentPage(1);
        setSearchParams({});
    };

    const totalPages = Math.ceil(totalClients / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(startItem + itemsPerPage - 1, totalClients);

    return (
        <div className="min-h-screen bg-gray-50 pt-16 px-4">
            <div className="mx-auto max-w-screen-xl bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="bg-white px-6 md:px-8 py-6 border-b">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
                        Gestión de Clientes
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Explora y gestiona la información de tus clientes.
                    </p>
                </div>

                {/* Controles */}
                <div className="px-6 md:px-8 py-6 space-y-4">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSuggestionClick={c => {
                            setSearchTerm(c.razclien);
                            setClients([c]);
                            setTotalClients(1);
                            setCurrentPage(1);
                        }}
                        handleSearchEnter={() => setCurrentPage(1)}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* País & Provincia */}
                        <div className="flex gap-4 flex-wrap">
                            <Select
                                options={countryCodes}
                                value={countryCodes.find(o => o.value === selectedCountry) || null}
                                onChange={opt => {
                                    setSelectedCountry(opt?.value || null);
                                    setCurrentPage(1);
                                    setSearchParams(ps => {
                                        const p = Object.fromEntries(ps);
                                        opt ? p.codpais = opt.value : delete p.codpais;
                                        return p;
                                    });
                                }}
                                placeholder="País..."
                                isClearable
                                className="w-full md:w-48"
                            />

                            <Select
                                options={provinces}
                                value={selectedProvince}
                                onChange={opt => {
                                    setSelectedProvince(opt || null);
                                    setCurrentPage(1);
                                    setSearchParams(ps => {
                                        const p = Object.fromEntries(ps);
                                        opt ? p.codprov = opt.value : delete p.codprov;
                                        return p;
                                    });
                                }}
                                placeholder="Provincia..."
                                isClearable
                                className="w-full md:w-48"
                            />
                        </div>

                        {/* Botones */}
                        <div className="flex gap-3 flex-wrap">
                            <button
                                onClick={() => { setSortByBilling(!sortByBilling); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-lg font-medium shadow-sm text-white transition ${sortByBilling ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
                                    }`}
                            >
                                {sortByBilling ? 'Ver por Código' : 'Ver por Facturación'}
                            </button>

                            <button
                                onClick={handleClearFilters}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm"
                            >
                                Limpiar Filtros
                            </button>

                            {/* selector items por página: oculto en móvil */}
                            <select
                                value={itemsPerPage}
                                onChange={e => { /* no cambia en móvil, siempre 10 */ }}
                                className="hidden md:block border rounded-lg px-3 py-2"
                                disabled
                            >
                                <option>10 / página</option>
                            </select>

                            {/* toggle vista: oculto en móvil */}
                            <div className="hidden md:flex items-center bg-gray-100 rounded-full p-2 space-x-2">
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`p-1 rounded-full transition ${viewMode === 'table'
                                        ? 'bg-white shadow text-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'}`}
                                    aria-label="Vista Tabla"
                                >
                                    <FiList size={20} />
                                </button>
                                <button
                                    onClick={() => setViewMode('cards')}
                                    className={`p-1 rounded-full transition ${viewMode === 'cards'
                                        ? 'bg-white shadow text-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'}`}
                                    aria-label="Vista Tarjetas"
                                >
                                    <FiGrid size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Contador */}
                        <p className="text-gray-600 text-sm w-full md:w-auto">
                            Mostrando <span className="font-semibold">{startItem}</span>–<span className="font-semibold">{endItem}</span> de <span className="font-semibold">{totalClients}</span>
                        </p>
                    </div>
                </div>

                {/* Contenido */}
                <div className="px-6 md:px-8 pb-8">
                    {loading ? (
                        <div className="flex justify-center py-12 text-gray-500">
                            <FiLoader className="animate-spin mr-2" /> Cargando clientes…
                        </div>
                    ) : clients.length === 0 ? (
                        <div className="text-center text-gray-500 py-12">
                            No hay clientes disponibles.
                        </div>
                    ) : viewMode === 'table' ? (
                        <ClientTable
                            clients={clients}
                            clientBillings={clientBillings}
                            getClientColor={b =>
                                b <= 1000 ? 'bg-yellow-400' :
                                    b <= 3000 ? 'bg-orange-400' :
                                        b <= 5000 ? 'bg-green-400' : 'bg-blue-400'
                            }
                            handleClientClick={async codclien => {
                                const r = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                const d = await r.json();
                                setSelectedClientDetails(d);
                                setModalVisible(true);
                            }}
                            setClients={setClients}
                        />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {clients.map(c => (
                                <ClientCard
                                    key={c.codclien}
                                    client={c}
                                    billing={clientBillings[c.codclien] || 0}
                                    colorClass={
                                        (clientBillings[c.codclien] || 0) <= 1000 ? 'bg-yellow-400' :
                                            (clientBillings[c.codclien] || 0) <= 3000 ? 'bg-orange-400' :
                                                (clientBillings[c.codclien] || 0) <= 5000 ? 'bg-green-400' : 'bg-blue-400'
                                    }
                                    onClick={async () => {
                                        const r = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${c.codclien}`, {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        const d = await r.json();
                                        setSelectedClientDetails(d);
                                        setModalVisible(true);
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* PAGINACIÓN SIEMPRE VISIBLE */}
                    {totalPages > 1 && (
                        <div className="mt-8">
                            <PaginationControls
                                currentPage={currentPage}
                                handlePageChange={setCurrentPage}
                                totalPages={totalPages}
                            />
                        </div>
                    )}
                </div>
            </div>

            {modalVisible && (
                <ClientModal
                    modalVisible={modalVisible}
                    selectedClientDetails={selectedClientDetails}
                    closeModal={() => setModalVisible(false)}
                    updateClientBilling={() => { }}
                />
            )}
        </div>
    );
}
