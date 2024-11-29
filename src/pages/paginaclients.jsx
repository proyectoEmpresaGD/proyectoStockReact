import { useEffect, useState } from 'react';
import Select from 'react-select';
import ClientTable from '../components/clientes/clientstable';
import ClientModal from '../components/clientes/modalclients';
import VisitModal from '../components/clientes/VisitModal';
import SearchBar from '../components/clientes/SearchBarClients';
import PaginationControls from '../components/PaginationControls';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { provinces, countryCodes } from '../Constants/constants.jsx';

function Clients() {
    const { token } = useAuthContext();
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [totalClients, setTotalClients] = useState(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clientBillings, setClientBillings] = useState({});
    const [sortByBilling, setSortByBilling] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (token) fetchClients();
    }, [currentPage, selectedCountry, selectedProvince, sortByBilling, searchTerm, token]);

    const fetchClients = async () => {
        try {
            setLoading(true);

            let url = `${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${currentPage}&limit=${itemsPerPage}`;
            if (sortByBilling) {
                url = `${import.meta.env.VITE_API_BASE_URL}/api/clients/billing?page=${currentPage}&limit=${itemsPerPage}`;
            }

            if (selectedCountry) url += `&codpais=${selectedCountry}`;
            if (selectedProvince) url += `&codprovi=${selectedProvince.value}`;
            if (searchTerm) url += `&query=${searchTerm}`;

            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setClients(data.clients || []);
            setTotalClients(data.total || 0);

            if (data.clients.length > 0) {
                await fetchClientBillings(data.clients);
            }
        } catch (error) {
            console.error('Error fetching client data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClientBillings = async (clients) => {
        if (!Array.isArray(clients)) return;

        try {
            const billingPromises = clients.map(client =>
                fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${client.codclien}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                    .then(response => response.json())
                    .then(data => {
                        const totalBilling = data.reduce((sum, product) => {
                            let importe = parseFloat(product.importe) || 0;
                            const dt1 = parseFloat(product.dt1) || 0;
                            const dt2 = parseFloat(product.dt2) || 0;
                            const dt3 = parseFloat(product.dt3) || 0;
                            if (dt1 > 0) importe -= (importe * dt1) / 100;
                            if (dt2 > 0) importe -= (importe * dt2) / 100;
                            if (dt3 > 0) importe -= (importe * dt3) / 100;
                            return sum + (importe > 0 ? importe : 0);
                        }, 0);
                        return { clientId: client.codclien, totalBilling };
                    })
            );

            const billings = await Promise.all(billingPromises);
            const billingsMap = billings.reduce((map, billing) => {
                map[billing.clientId] = billing.totalBilling;
                return map;
            }, {});
            setClientBillings(billingsMap);
        } catch (error) {
            console.error('Error fetching client billings:', error);
        }
    };

    const handleSuggestionClick = async (client) => {
        try {
            setSearchTerm(client.razclien);
            setClients([client]);
            setTotalClients(1);
            setCurrentPage(1);

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${client.codclien}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const billingData = await response.json();
                const totalBilling = billingData.reduce((sum, product) => {
                    let importe = parseFloat(product.importe) || 0;
                    const dt1 = parseFloat(product.dt1) || 0;
                    const dt2 = parseFloat(product.dt2) || 0;
                    const dt3 = parseFloat(product.dt3) || 0;
                    if (dt1 > 0) importe -= (importe * dt1) / 100;
                    if (dt2 > 0) importe -= (importe * dt2) / 100;
                    if (dt3 > 0) importe -= (importe * dt3) / 100;
                    return sum + (importe > 0 ? importe : 0);
                }, 0);
                setClientBillings({ [client.codclien]: totalBilling });
            }
        } catch (error) {
            console.error('Error handling suggestion click:', error);
        }
    };

    const handleClearFilter = async () => {
        setSelectedProvince(null);
        setSelectedCountry(null);
        setSearchTerm('');
        setSortByBilling(false);
        setSuggestions([]);
        setCurrentPage(1);
        await fetchClients();
    };

    const toggleSortByBilling = () => {
        setSortByBilling((prev) => !prev);
        setCurrentPage(1);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleClientClick = async (codclien) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                throw new Error('Error fetching client details');
            }
            const data = await response.json();
            setSelectedClientDetails(data);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching client details:', error);
        }
    };

    const getClientColor = (totalBilling) => {
        if (totalBilling <= 1000) return 'bg-yellow-500';
        if (totalBilling <= 3000) return 'bg-orange-500';
        if (totalBilling <= 5000) return 'bg-green-500';
        return 'bg-blue-500';
    };

    const totalPages = Math.ceil(totalClients / itemsPerPage);

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center md:px-4 px-2 py-6">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-24">
                <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-gray-700">Gestión de Clientes</h1>
                <p className="text-lg md:text-xl mb-6 text-center text-gray-600">
                    Explora y gestiona los datos de tus clientes con nuestras herramientas eficientes e intuitivas.
                </p>

                <div className="mb-8">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSearchEnter={() => fetchClients()}
                        handleSuggestionClick={handleSuggestionClick}
                    />
                </div>

                <div className="flex flex-wrap justify-center md:justify-between items-center mb-8 gap-4">
                    <div className="flex gap-4">
                        <Select
                            options={countryCodes}
                            value={countryCodes.find(option => option.value === selectedCountry)}
                            onChange={(option) => {
                                setSelectedCountry(option ? option.value : null);
                                setCurrentPage(1);
                            }}
                            placeholder="Seleccione país"
                            isClearable
                        />
                        <Select
                            options={provinces}
                            value={selectedProvince}
                            onChange={(option) => {
                                setSelectedProvince(option);
                                setCurrentPage(1);
                            }}
                            placeholder="Seleccione provincia"
                            isClearable
                        />
                    </div>
                    <button
                        onClick={toggleSortByBilling}
                        className={`px-6 py-2 text-white font-medium rounded-lg transition duration-200 shadow ${sortByBilling ? 'bg-green-500' : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                    >
                        {sortByBilling ? 'Ordenar por Código' : 'Ordenar por Facturación'}
                    </button>
                    <button
                        onClick={handleClearFilter}
                        className="px-6 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition duration-200 shadow"
                    >
                        Limpiar Filtros
                    </button>
                </div>

                {loading ? (
                    <div className="text-center">Cargando...</div>
                ) : clients.length > 0 ? (
                    <div className="overflow-x-auto mb-8">
                        <ClientTable
                            clients={clients}
                            clientBillings={clientBillings}
                            getClientColor={getClientColor}
                            handleClientClick={handleClientClick}
                        />
                    </div>
                ) : (
                    <div className="text-center text-gray-500">No hay clientes disponibles.</div>
                )}

                {totalPages > 1 && (
                    <PaginationControls
                        currentPage={currentPage}
                        handlePageChange={handlePageChange}
                        totalPages={totalPages}
                    />
                )}
            </div>

            {modalVisible && (
                <ClientModal
                    modalVisible={modalVisible}
                    selectedClientDetails={selectedClientDetails}
                    closeModal={() => setModalVisible(false)}
                />
            )}

            {visitModalVisible && (
                <VisitModal
                    modalVisible={visitModalVisible}
                    selectedClientId={selectedClientId}
                    closeModal={() => setVisitModalVisible(false)}
                />
            )}
        </div>
    );
}

export default Clients;
