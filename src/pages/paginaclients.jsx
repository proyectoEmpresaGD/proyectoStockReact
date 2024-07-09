import { useEffect, useState } from 'react';
import SearchBar from '../components/SearchBarClients';
import Select from 'react-select';
import ClientTable from '../components/clientstable';
import PaginationControls from '../components/PaginationControls';
import ClientModal from '../components/modalclients';

const provinces = [
    { value: '02', label: 'Albacete' },
    { value: '03', label: 'Alicante/Alacant' },
    { value: '04', label: 'Almería' },
    { value: '01', label: 'Araba/Álava' },
    { value: '33', label: 'Asturias' },
    { value: '05', label: 'Ávila' },
    { value: '06', label: 'Badajoz' },
    { value: '07', label: 'Balears, Illes' },
    { value: '08', label: 'Barcelona' },
    { value: '48', label: 'Bizkaia' },
    { value: '09', label: 'Burgos' },
    { value: '10', label: 'Cáceres' },
    { value: '11', label: 'Cádiz' },
    { value: '39', label: 'Cantabria' },
    { value: '12', label: 'Castellón/Castelló' },
    { value: '13', label: 'Ciudad Real' },
    { value: '14', label: 'Córdoba' },
    { value: '15', label: 'Coruña, A' },
    { value: '16', label: 'Cuenca' },
    { value: '20', label: 'Gipuzkoa' },
    { value: '17', label: 'Girona' },
    { value: '18', label: 'Granada' },
    { value: '19', label: 'Guadalajara' },
    { value: '21', label: 'Huelva' },
    { value: '22', label: 'Huesca' },
    { value: '23', label: 'Jaén' },
    { value: '24', label: 'León' },
    { value: '25', label: 'Lleida' },
    { value: '27', label: 'Lugo' },
    { value: '28', label: 'Madrid' },
    { value: '29', label: 'Málaga' },
    { value: '30', label: 'Murcia' },
    { value: '31', label: 'Navarra' },
    { value: '32', label: 'Ourense' },
    { value: '34', label: 'Palencia' },
    { value: '35', label: 'Palmas, Las' },
    { value: '36', label: 'Pontevedra' },
    { value: '26', label: 'Rioja, La' },
    { value: '37', label: 'Salamanca' },
    { value: '38', label: 'Santa Cruz de Tenerife' },
    { value: '40', label: 'Segovia' },
    { value: '41', label: 'Sevilla' },
    { value: '42', label: 'Soria' },
    { value: '43', label: 'Tarragona' },
    { value: '44', label: 'Teruel' },
    { value: '45', label: 'Toledo' },
    { value: '46', label: 'Valencia/València' },
    { value: '47', label: 'Valladolid' },
    { value: '49', label: 'Zamora' },
    { value: '50', label: 'Zaragoza' },
    { value: '51', label: 'Ceuta' },
    { value: '52', label: 'Melilla' }
];

function Clients() {
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredClients, setFilteredClients] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);
    const [lastSearch, setLastSearch] = useState('');
    const [singleClientView, setSingleClientView] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);

    useEffect(() => {
        const fetchClients = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${currentPage}&limit=${itemsPerPage}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setClients(data);
                setFilteredClients(data);
            } catch (error) {
                console.error('Error fetching client data:', error);
            }
        };
        fetchClients();
    }, [currentPage, itemsPerPage]);

    useEffect(() => {
        if (searchTerm.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${searchTerm}&limit=4`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => setSuggestions(data))
                .catch(error => console.error('Error fetching search suggestions:', error));
        } else {
            setSuggestions([]);
        }
    }, [searchTerm]);
    
    const performSearch = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${query}&limit=${itemsPerPage}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                setFilteredClients(data);
                setSingleClientView(data.length === 1);
            })
            .catch(error => console.error('Error performing search:', error));
    };

    useEffect(() => {
        if (selectedProvince) {
            const provinceValue = selectedProvince.value;
            const url = `${import.meta.env.VITE_API_BASE_URL}/api/clients/province/${provinceValue}`;

            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                            throw new Error(`Network response was not ok: ${text}`);
                        });
                    }
                    return response.json();
                })
                .then(data => setFilteredClients(data))
                .catch(error => console.error('Error fetching clients:', error));
        } else {
            setFilteredClients(clients);
        }
    }, [selectedProvince, clients]);

    const handleSearchInputChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const handleSearchKeyPress = (event) => {
        if (event.key === 'Enter') {
            setLastSearch(searchTerm);
            performSearch(searchTerm);
            setSearchTerm('');
        }
    };

    const handleSuggestionClick = (client) => {
        setFilteredClients([client]);
        setLastSearch(client.razclien);
        setSingleClientView(true);
        setSearchTerm('');
        setSuggestions([]);
    };

    const handleShowAll = () => {
        setSearchTerm('');
        setFilteredClients(clients);
        setSingleClientView(false);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleLastSearchClick = () => {
        performSearch(lastSearch);
        setSearchTerm('');
    };

    const handleClientClick = async (codclien) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setSelectedClientDetails(data);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching client details:', error);
        }
    };

    const closeModal = () => {
        setModalVisible(false);
        setSelectedClientDetails(null);
    };

    const handleProvinceChange = (selectedOption) => {
        setSelectedProvince(selectedOption);
    };

    const handleClearFilter = () => {
        setSelectedProvince(null);
        setFilteredClients(clients); // Reset filtered clients to the original clients list
    };

    return (
        <div className="container mx-auto justify-center text-center py-4">
            <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                suggestions={suggestions}
                handleSearchInputChange={handleSearchInputChange}
                handleSearchKeyPress={handleSearchKeyPress}
                handleSuggestionClick={handleSuggestionClick}
            />
            {lastSearch && (
                <button
                    onClick={handleLastSearchClick}
                    className="mb-4 px-4 py-2 bg-yellow-400 text-white rounded cursor-pointer hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-600"
                >
                    Última búsqueda: {lastSearch}
                </button>
            )}
            <div className="mb-4">
                <label htmlFor="provinceFilter" className="block text-sm font-medium text-gray-700">Filtrar por Provincia</label>
                <div className="flex items-center mt-2">
                    <Select
                        id="provinceFilter"
                        options={provinces}
                        value={selectedProvince}
                        onChange={handleProvinceChange}
                        className="flex-1"
                        placeholder="Seleccione una provincia"
                    />
                    <button
                        onClick={handleClearFilter}
                        className="ml-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
                    >
                        Limpiar
                    </button>
                </div>
            </div>

            <ClientTable clients={filteredClients} handleClientClick={handleClientClick} />
            {!singleClientView && (
                <PaginationControls currentPage={currentPage} handlePageChange={handlePageChange} />
            )}
            {singleClientView && (
                <button
                    onClick={handleShowAll}
                    className="mt-4 px-4 py-2 bg-green-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                    Mostrar todos
                </button>
            )}
            <ClientModal
                modalVisible={modalVisible}
                selectedClientDetails={selectedClientDetails}
                closeModal={closeModal}
            />
        </div>
    );
}

export default Clients;