import { useEffect, useState } from 'react';
import Select from 'react-select';
import ClientTable from '../components/clientes/clientstable';
import ClientModal from '../components/clientes/modalclients';
import VisitModal from '../components/clientes/VisitModal';
import SearchBar from '../components/clientes/SearchBarClients';
import PaginationControls from '../components/PaginationControls';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { provinces, countryCodes } from '../Constants/constants.jsx'; // Importar provincias y países

function Clients() {
    const { token } = useAuthContext(); // Obtener el token del contexto de autenticación
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10); // Número de clientes por página
    const [totalClients, setTotalClients] = useState(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clientBillings, setClientBillings] = useState({});
    const [singleClientView, setSingleClientView] = useState(false);

    useEffect(() => {
        if (token) fetchClients(); // Ejecuta la llamada solo si hay token
    }, [currentPage, selectedCountry, selectedProvince, token]);

    const fetchClients = async (page = currentPage, query = searchTerm) => {
        try {
            let url = `${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${page}&limit=${itemsPerPage}`;
            if (selectedCountry) {
                url += `&codpais=${selectedCountry}`;
            }
            if (selectedProvince) {
                url += `&codprovi=${selectedProvince.value}`;
            }
            if (query) {
                url += `&query=${query}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (Array.isArray(data.clients)) {
                setClients(data.clients);
                setTotalClients(data.total);
                fetchClientBillings(data.clients);
                setSingleClientView(data.clients.length === 1);
            } else {
                console.error('El dato recibido no es un array:', data);
            }
        } catch (error) {
            console.error('Error fetching client data:', error);
        }
    };

    const fetchClientBillings = async (clients) => {
        if (!Array.isArray(clients)) return;

        try {
            const billingPromises = clients.map(client =>
                fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${client.codclien}`, {
                    headers: { 'Authorization': `Bearer ${token}` } // Autenticación
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

    const handleSuggestionClick = (client) => {
        setSearchTerm(client.razclien);
        setClients([client]); // Actualiza la tabla con el cliente seleccionado
        setSuggestions([]); // Limpia las sugerencias
        setTotalClients(1); // Ajusta el contador total de clientes
        setCurrentPage(1); // Reinicia la paginación
    };

    const handleSearchInputChange = async (event) => {
        const searchTerm = event.target.value.trim();
        setSearchTerm(searchTerm);

        if (searchTerm.length > 1) {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${searchTerm}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
                const data = await response.json();
                // Actualizar sugerencias en tiempo real basadas en el término
                setSuggestions(data.filter(client => client.razclien.toLowerCase().includes(searchTerm.toLowerCase())));
            } catch (error) {
                console.error('Error fetching suggestions:', error);
            }
        } else {
            setSuggestions([]);
        }
    };

    const handleSearchKeyPress = (event) => {
        if (event.key === 'Enter') {
            setCurrentPage(1); // Reinicia la paginación al buscar
            setSuggestions([]); // Limpia las sugerencias
            fetchClients(); // Realiza la búsqueda con el término actual
        }
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        fetchClients(newPage, searchTerm); // Incluye el término de búsqueda
    };

    const handleClientClick = async (codclien) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`, {
                headers: { 'Authorization': `Bearer ${token}` } // Autenticación
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            setSelectedClientDetails(data);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching client details:', error);
        }
    };

    const handleVisitClick = (clientId) => {
        setSelectedClientId(clientId);
        setVisitModalVisible(true);
    };

    const closeModal = () => setModalVisible(false);
    const closeVisitModal = () => setVisitModalVisible(false);

    const handleProvinceChange = (selectedOption) => {
        setSelectedProvince(selectedOption);
        setCurrentPage(1);
        fetchClients(1, searchTerm); // Incluye el término de búsqueda actual
    };

    const handleCountryChange = (selectedOption) => {
        setSelectedCountry(selectedOption ? selectedOption.value : null);
        setCurrentPage(1);
        fetchClients(1, searchTerm); // Incluye el término de búsqueda actual
    };

    const handleClearFilter = () => {
        setSelectedProvince(null);
        setSelectedCountry(null);
        setSearchTerm('');
        setSuggestions([]);
        setCurrentPage(1);
        fetchClients(); // Recupera todos los clientes originales
    };

    const getClientColor = (totalBilling) => {
        if (totalBilling <= 1000) return 'bg-yellow-500';
        if (totalBilling <= 3000) return 'bg-orange-500';
        if (totalBilling <= 5000) return 'bg-green-500';
        return 'bg-blue-500';
    };

    const totalPages = Math.ceil(totalClients / itemsPerPage);

    return (
        <div className="container mx-auto justify-center text-center mt-[15%] md:mt-[0%] py-4 px-4 md:px-8">
            <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                suggestions={suggestions}
                setSuggestions={setSuggestions}
                handleSearchEnter={() => fetchClients(1, searchTerm)} // Ejecuta fetchClients con el término actual
                handleSuggestionClick={handleSuggestionClick}
            />

            <div className="md:mb-4 mb-0 justify-between items-center md:flex grid grid-rows-2">
                <div className="flex md:space-x-4 space-x-1">
                    <div className="w-40">
                        <label htmlFor="countryFilter" className="block text-xs md:text-sm font-medium text-gray-700">País</label>
                        <Select
                            id="countryFilter"
                            options={countryCodes}
                            value={countryCodes.find(option => option.value === selectedCountry)}
                            onChange={handleCountryChange}
                            placeholder="Seleccione un país"
                            isClearable={true}
                        />
                    </div>
                    <div className="w-48">
                        <label htmlFor="provinceFilter" className="block text-xs md:text-sm font-medium text-gray-700">Provincia</label>
                        <Select
                            id="provinceFilter"
                            options={provinces}
                            value={selectedProvince}
                            onChange={handleProvinceChange}
                            placeholder="Seleccione una provincia"
                            isClearable={true}
                        />
                    </div>
                </div>
                <button
                    onClick={handleClearFilter}
                    className="px-4 py-1 md:py-2 w-3/4 md:w-1/5 mx-auto md:mx-0 bg-red-500 text-white rounded hover:bg-red-700"
                >
                    Limpiar Filtros
                </button>
            </div>
            <ClientTable
                clients={clients}
                handleClientClick={handleClientClick}
                handleVisitClick={handleVisitClick}
                clientBillings={clientBillings}
                getClientColor={getClientColor}
            />
            {totalPages > 1 && (
                <PaginationControls currentPage={currentPage} handlePageChange={handlePageChange} totalPages={totalPages} />
            )}

            <ClientModal
                modalVisible={modalVisible}
                selectedClientDetails={selectedClientDetails}
                closeModal={closeModal}
            />
            <VisitModal
                modalVisible={visitModalVisible}
                selectedClientId={selectedClientId}
                closeModal={closeVisitModal}
            />
        </div>
    );
}

export default Clients;
