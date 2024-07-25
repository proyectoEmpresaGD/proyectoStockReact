import { useEffect, useState, useRef } from 'react';
import SearchBar from './SearchBarEquivalencias';


const EquivalenciasTable = () => {
    const [equivalencias, setEquivalencias] = useState([]);
    const [filteredEquivalencias, setFilteredEquivalencias] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
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
        if (searchTerm.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${searchTerm}`)
                .then(response => response.json())
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
            performSearch(searchTerm);
        }
    };

    const performSearch = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${query}`)
            .then(response => response.json())
            .then(data => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true); // Set search active
                setLastSearch(query); // Save the last search term
                setSearchTerm('');
                setSuggestions([]);
                setCurrentPage(1); // Reset to the first page after search
            })
            .catch(error => console.error('Error performing search:', error));
    };

    const handleSuggestionClick = (item) => {
        setSearchTerm(item.desequiv);
        setFilteredEquivalencias([item]);
        setIsSearchActive(true); // Set search active
        setLastSearch(item.desequiv); // Save the last search term
        setSuggestions([]);
    };

    const handleShowAll = () => {
        setSearchTerm('');
        setFilteredEquivalencias(equivalencias);
        setIsSearchActive(false); // Set search inactive
        setCurrentPage(1); // Reset to the first page
    };

    const handleLastSearchClick = () => {
        performSearch(lastSearch);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleClickOutside = (event) => {
        if (searchBarRef.current && !searchBarRef.current.contains(event.target)) {
            setSuggestions([]);
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
                <SearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    suggestions={suggestions}
                    handleSearchInputChange={handleSearchInputChange}
                    handleSearchKeyPress={handleSearchKeyPress}
                    handleSuggestionClick={handleSuggestionClick}
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
                            <th className="px-4 py-2 border-b">RazProve</th>
                            <th className="px-4 py-2 border-b">CodEquiv</th>

                        </tr>
                    </thead>
                    <tbody>
                        {filteredEquivalencias.map((equiv, index) => (
                            <tr key={index}>
                                <td className="px-4 py-2 border-b">{equiv.desprodu}</td>
                                <td className="px-4 py-2 border-b">{equiv.desequiv}</td>
                                <td className="px-4 py-2 border-b">{equiv.razprove}</td>
                                <td className="px-4 py-2 border-b">{equiv.codequiv}</td>
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
