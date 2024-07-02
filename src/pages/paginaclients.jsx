import { useEffect, useState } from 'react';
import SearchBar from '../components/SearchBarClients';
import ClientTable from '../components/clientstable';
import PaginationControls from '../components/PaginationControls';
import ClientModal from '../components/modalclients';

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