// components/EquivalenciasTable.jsx
import { useEffect, useState, useRef } from 'react';
import SearchBarEquivalencias from './SearchBarEquivalencias';
import SearchBar from './SearchBar'; // Import the existing search bar

const EquivalenciasTable = () => {
    const [equivalencias, setEquivalencias] = useState([]);
    const [filteredEquivalencias, setFilteredEquivalencias] = useState([]);
    const [searchTermProveedor, setSearchTermProveedor] = useState('');
    const [searchTermCJMW, setSearchTermCJMW] = useState('');
    const [suggestionsProveedor, setSuggestionsProveedor] = useState([]);
    const [suggestionsCJMW, setSuggestionsCJMW] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [lastSearch, setLastSearch] = useState('');
    const searchBarRef = useRef(null);

    useEffect(() => {
        fetchEquivalencias();
    }, [currentPage]);

    const fetchEquivalencias = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias?limit=${itemsPerPage}&offset=${(currentPage - 1) * itemsPerPage}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setEquivalencias(data);
            setFilteredEquivalencias(data);
        } catch (error) {
            console.error('Error fetching equivalencias:', error);
        }
    };

    useEffect(() => {
        if (searchTermProveedor.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${searchTermProveedor}`)
                .then(response => response.json())
                .then(data => setSuggestionsProveedor(data))
                .catch(error => console.error('Error fetching search suggestions:', error));
        } else {
            setSuggestionsProveedor([]);
        }
    }, [searchTermProveedor]);

    useEffect(() => {
        if (searchTermCJMW.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${searchTermCJMW}`)
                .then(response => response.json())
                .then(data => setSuggestionsCJMW(data))
                .catch(error => console.error('Error fetching search suggestions:', error));
        } else {
            setSuggestionsCJMW([]);
        }
    }, [searchTermCJMW]);

    const handleSearchInputChangeProveedor = (event) => {
        setSearchTermProveedor(event.target.value);
        if (searchTermCJMW) setSearchTermCJMW(''); // Clear the other search term
    };

    const handleSearchInputChangeCJMW = (event) => {
        setSearchTermCJMW(event.target.value);
        if (searchTermProveedor) setSearchTermProveedor(''); // Clear the other search term
    };

    const handleSearchKeyPressProveedor = (event) => {
        if (event.key === 'Enter') {
            performSearchProveedor(searchTermProveedor);
        }
    };

    const handleSearchKeyPressCJMW = (event) => {
        if (event.key === 'Enter') {
            performSearchCJMW(searchTermCJMW);
        }
    };

    const performSearchProveedor = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${query}`)
            .then(response => response.json())
            .then(data => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true); // Set search active
                setLastSearch(query); // Save the last search term
                setSearchTermProveedor('');
                setSuggestionsProveedor([]);
                setCurrentPage(1); // Reset to the first page after search
            })
            .catch(error => console.error('Error performing search:', error));
    };

    const performSearchCJMW = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${query}`)
            .then(response => response.json())
            .then(data => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true); // Set search active
                setLastSearch(query); // Save the last search term
                setSearchTermCJMW('');
                setSuggestionsCJMW([]);
                setCurrentPage(1); // Reset to the first page after search
            })
            .catch(error => console.error('Error performing search:', error));
    };

    const handleSuggestionClickProveedor = (item) => {
        setSearchTermProveedor(item.desequiv);
        setFilteredEquivalencias([item]);
        setIsSearchActive(true); // Set search active
        setLastSearch(item.desequiv); // Save the last search term
        setSuggestionsProveedor([]);
    };

    const handleSuggestionClickCJMW = (item) => {
        setSearchTermCJMW(item.desprodu);
        setFilteredEquivalencias([item]);
        setIsSearchActive(true); // Set search active
        setLastSearch(item.desprodu); // Save the last search term
        setSuggestionsCJMW([]);
    };

    const handleShowAll = () => {
        setSearchTermProveedor('');
        setSearchTermCJMW('');
        setFilteredEquivalencias(equivalencias);
        setIsSearchActive(false); // Set search inactive
        setCurrentPage(1); // Reset to the first page
    };

    const handleLastSearchClick = () => {
        performSearchProveedor(lastSearch);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleClickOutside = (event) => {
        if (searchBarRef.current && !searchBarRef.current.contains(event.target)) {
            setSuggestionsProveedor([]);
            setSuggestionsCJMW([]);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4 text-center">Equivalencias</h1>
            <div ref={searchBarRef}>
                <SearchBarEquivalencias
                    searchTerm={searchTermProveedor}
                    setSearchTerm={setSearchTermProveedor}
                    suggestions={suggestionsProveedor}
                    handleSearchInputChange={handleSearchInputChangeProveedor}
                    handleSearchKeyPress={handleSearchKeyPressProveedor}
                    handleSuggestionClick={handleSuggestionClickProveedor}
                />
                <SearchBar
                    searchTerm={searchTermCJMW}
                    setSearchTerm={setSearchTermCJMW}
                    suggestions={suggestionsCJMW}
                    handleSearchInputChange={handleSearchInputChangeCJMW}
                    handleSearchKeyPress={handleSearchKeyPressCJMW}
                    handleSuggestionClick={handleSuggestionClickCJMW}
                />
            </div>
            {isSearchActive && (
                <button
                    onClick={handleShowAll}
                    className="mb-4 px-4 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                    Mostrar todos
                </button>
            )}
            {lastSearch && (
                <button
                    onClick={handleLastSearchClick}
                    className="mb-4 px-4 py-2 bg-green-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                    Última búsqueda: {lastSearch}
                </button>
            )}
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-300 text-sm">
                    <thead className="bg-gray-200">
                        <tr>
                            <th className="px-4 py-2 border-b">NOMBRE CJMW</th>
                            <th className="px-4 py-2 border-b">NOMBRE Proveedor</th>
                            <th className="px-4 py-2 border-b">CodEquiv</th>
                            <th className="px-4 py-2 border-b">RazProve</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEquivalencias.map((equiv, index) => (
                            <tr key={index}>
                                <td className="px-4 py-2 border-b">{equiv.desprodu}</td>
                                <td className="px-4 py-2 border-b">{equiv.desequiv}</td>
                                <td className="px-4 py-2 border-b">{equiv.codequiv}</td>
                                <td className="px-4 py-2 border-b">{equiv.razprove}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!isSearchActive && (
                <div className="flex justify-center mt-4">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 mx-1 bg-gray-300 rounded disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="px-4 py-2">{currentPage}</span>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="px-4 py-2 mx-1 bg-gray-300 rounded"
                    >
                        Siguiente
                    </button>
                </div>
            )}
        </div>
    );
};

export default EquivalenciasTable;
