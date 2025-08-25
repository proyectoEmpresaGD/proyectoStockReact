import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { FiLoader, FiList } from 'react-icons/fi';
import { useAuthContext } from '../Auth/AuthContext';
import { provinces, countryCodes } from '../Constants/constants';
import SearchBar from '../components/clientes/SearchBarClients';
import ClientTable from '../components/clientes/clientstable.jsx';
import ClientModal from '../components/clientes/modal/ClientModal';
import PaginationControls from '../components/PaginationControls';

export default function Clients() {
    const { token } = useAuthContext();
    const [searchParams, setSearchParams] = useSearchParams();

    // datos + loading
    const [clients, setClients] = useState([]);
    const [clientBillings, setClientBillings] = useState({});
    const [clientBillingsYear, setClientBillingsYear] = useState({});
    const [loading, setLoading] = useState(false);

    // filtros / paginación / búsqueda
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalClients, setTotalClients] = useState(0);

    const [selectedCountry, setSelectedCountry] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [sortByBilling, setSortByBilling] = useState(false);

    // vista
    const [viewMode, setViewMode] = useState('table');

    // modal detalle
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);

    // leer URL params
    useEffect(() => {
        const cp = searchParams.get('codpais');
        const cv = searchParams.get('codprov');
        if (cp) setSelectedCountry(cp);
        if (cv) {
            const prov = provinces.find(p => p.value === cv);
            if (prov) setSelectedProvince(prov);
        }
    }, [searchParams]);

    // cada vez que cambias búsqueda, país, provincia o página: volver a "ver por código"
    useEffect(() => {
        if (sortByBilling) {
            setSortByBilling(false);
            setCurrentPage(1);
        }
    }, [searchTerm, selectedCountry, selectedProvince, itemsPerPage]);

    // fetch clients + billings
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

                // Año actual a 2 dígitos: 2025 -> "25"
                const yy = String(new Date().getFullYear() % 100).padStart(2, '0');

                const mapAll = {};
                const mapYear = {};

                await Promise.all((data.clients || []).map(async (c) => {
                    const r2 = await fetch(
                        `${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${c.codclien}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (!r2.ok) {
                        mapAll[c.codclien] = 0;
                        mapYear[c.codclien] = 0;
                        return;
                    }

                    const pd = await r2.json();

                    let totalAll = 0;
                    let totalYear = 0;

                    pd.forEach(p => {
                        // importe con descuentos encadenados
                        let imp = +p.importe || 0;
                        [p.dt1, p.dt2, p.dt3].forEach(d => {
                            const dd = Math.floor(d || 0);
                            if (dd > 0) imp *= 1 - dd / 100;
                        });
                        imp = Math.max(imp, 0);

                        totalAll += imp;

                        // ejercicio: 25 o 2025 → compara últimos 2 dígitos
                        const ej = String(p.ejercicio ?? '').trim();
                        if (ej && ej.slice(-2) === yy) {
                            totalYear += imp;
                        }
                    });

                    mapAll[c.codclien] = +totalAll.toFixed(2);
                    mapYear[c.codclien] = +totalYear.toFixed(2);
                }));

                setClientBillings(mapAll);       // total histórico
                setClientBillingsYear(mapYear);  // solo año actual
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
        sortByBilling
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
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 pt-16 py-8 px-4">
            <div className="mx-auto max-w-screen-xl bg-white rounded-2xl shadow-2xl overflow-hidden mt-12">
                {/* Header */}
                <div className="bg-white px-6 md:px-8 py-6 border-b">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
                        Gestión de Clientes
                    </h1>
                    <p className="mt-1 md:mt-2 text-gray-600">
                        Explora y gestiona la información de tus clientes.
                    </p>
                </div>

                {/* Controls */}
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
                        {/* Country & Province */}
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
                                className="w-48"
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
                                className="w-48"
                            />
                        </div>

                        {/* Sort + Clear + (itemsPerPage hidden en móvil) */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => { setSortByBilling(!sortByBilling); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-lg font-medium shadow-sm text-white transition 
                  ${sortByBilling ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                            >
                                {sortByBilling ? 'Ver por Código' : 'Ver por Facturación'}
                            </button>

                            <button
                                onClick={handleClearFilters}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm"
                            >
                                Limpiar Filtros
                            </button>

                            {/* ítems/page solo en md+ */}
                            <select
                                value={itemsPerPage}
                                onChange={e => { setItemsPerPage(+e.target.value); setCurrentPage(1); }}
                                className="hidden md:block border rounded-lg px-3 py-2"
                            >
                                {[10, 25, 50].map(n => (
                                    <option key={n} value={n}>{n} / página</option>
                                ))}
                            </select>
                        </div>

                        {/* Contador */}
                        <p className="text-gray-600 text-sm whitespace-nowrap">
                            Mostrando <span className="font-semibold">{startItem}</span>–
                            <span className="font-semibold">{endItem}</span> de
                            <span className="font-semibold"> {totalClients}</span>
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 md:px-8 pb-8">
                    {loading ? (
                        <div className="flex justify-center py-12 text-gray-500">
                            <FiLoader className="animate-spin mr-2" /> Cargando clientes…
                        </div>
                    ) : (
                        <ClientTable
                            clients={clients}
                            // 👇 clave: la tabla recibe el mapa del AÑO ACTUAL para color y cifra
                            clientBillings={clientBillingsYear}
                            getClientColor={(b) =>
                                b <= 1000 ? 'bg-yellow-400'
                                    : b <= 3000 ? 'bg-orange-400'
                                        : b <= 5000 ? 'bg-green-400'
                                            : 'bg-blue-400'
                            }
                            handleClientClick={async (codclien) => {
                                const r = await fetch(
                                    `${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                );
                                const d = await r.json();
                                setSelectedClientDetails(d);
                                setModalVisible(true);
                            }}
                            setClients={setClients}
                        />
                    )}

                    {/* Paginación SIEMPRE visible */}
                    {totalPages > 1 && (
                        <div className="mt-6">
                            <PaginationControls
                                currentPage={currentPage}
                                handlePageChange={setCurrentPage}
                                totalPages={totalPages}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
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
