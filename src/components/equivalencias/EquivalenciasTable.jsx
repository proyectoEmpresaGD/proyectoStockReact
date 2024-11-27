import { useEffect, useState, useRef } from 'react';
import SearchBarEquivalencias from './SearchBarEquivalencias';
import SearchBar from '../productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';

const EquivalenciasTable = () => {
    const { user, token } = useAuthContext();
    const [equivalencias, setEquivalencias] = useState([]);
    const [filteredEquivalencias, setFilteredEquivalencias] = useState([]);
    const [searchTermProveedor, setSearchTermProveedor] = useState('');
    const [searchTermCJMW, setSearchTermCJMW] = useState('');
    const [suggestionsProveedor, setSuggestionsProveedor] = useState([]);
    const [suggestionsCJMW, setSuggestionsCJMW] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [lastSearch, setLastSearch] = useState(''); // Almacenar la última búsqueda
    const searchBarRef = useRef(null);

    useEffect(() => {
        if (user && (user.role === 'almacen' || user.role === 'admin')) {
            fetchEquivalencias();
        }
    }, [currentPage, user]);

    // Obtener equivalencias de la API
    const fetchEquivalencias = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias?limit=${itemsPerPage}&offset=${(currentPage - 1) * itemsPerPage}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
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

    // Búsqueda de sugerencias por proveedor
    useEffect(() => {
        if (searchTermProveedor.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${searchTermProveedor}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
                .then(response => response.json())
                .then(data => setSuggestionsProveedor(data))
                .catch(error => console.error('Error fetching suggestions:', error));
        } else {
            setSuggestionsProveedor([]);
        }
    }, [searchTermProveedor, token]);

    // Búsqueda de sugerencias por CJMW
    useEffect(() => {
        if (searchTermCJMW.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${searchTermCJMW}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
                .then(response => response.json())
                .then(data => setSuggestionsCJMW(data))
                .catch(error => console.error('Error fetching suggestions:', error));
        } else {
            setSuggestionsCJMW([]);
        }
    }, [searchTermCJMW, token]);

    // Función de búsqueda por proveedor
    const performSearchProveedor = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${query}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(response => response.json())
            .then(data => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true);
                setLastSearch(`Proveedor: ${query}`);
                setSearchTermProveedor('');
                setSuggestionsProveedor([]);
                setCurrentPage(1);
            })
            .catch(error => console.error('Error performing search:', error));
    };

    // Función de búsqueda por CJMW
    const performSearchCJMW = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${query}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(response => response.json())
            .then(data => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true);
                setLastSearch(`CJMW: ${query}`);
                setSearchTermCJMW('');
                setSuggestionsCJMW([]);
                setCurrentPage(1);
            })
            .catch(error => console.error('Error performing search:', error));
    };

    // Limpiar búsqueda y mostrar todos
    const handleShowAll = () => {
        setSearchTermProveedor('');
        setSearchTermCJMW('');
        setFilteredEquivalencias(equivalencias);
        setIsSearchActive(false);
        setCurrentPage(1);
    };

    // Evento cuando se selecciona una sugerencia por proveedor
    const handleSuggestionClickProveedor = (item) => {
        performSearchProveedor(item.desequiv);
    };

    // Evento cuando se selecciona una sugerencia por CJMW
    const handleSuggestionClickCJMW = (item) => {
        performSearchCJMW(item.desprodu);
    };

    // Manejo de paginación
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };
    useEffect(() => {
        const handleClickOutsideProveedor = (event) => {
            if (searchBarRef.current && !searchBarRef.current.contains(event.target)) {
                setSuggestionsProveedor([]);
            }
        };

        const handleClickOutsideCJMW = (event) => {
            if (searchBarRef.current && !searchBarRef.current.contains(event.target)) {
                setSuggestionsCJMW([]);
            }
        };

        document.addEventListener('mousedown', handleClickOutsideProveedor);
        document.addEventListener('mousedown', handleClickOutsideCJMW);

        return () => {
            document.removeEventListener('mousedown', handleClickOutsideProveedor);
            document.removeEventListener('mousedown', handleClickOutsideCJMW);
        };
    }, [setSuggestionsProveedor, setSuggestionsCJMW]);


    // Si el usuario no tiene acceso, mostrar un mensaje de error
    if (user && user.role !== 'almacen' && user.role !== 'admin') {
        return <div className="text-center text-red-500">Acceso denegado. No tienes permisos para ver las equivalencias.</div>;
    }

    return (
        <div className="container mx-auto bg-white shadow-lg rounded-lg p-6 md:p-8">


            {/* Barra de búsqueda */}
            <div ref={searchBarRef} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SearchBarEquivalencias
                        searchTerm={searchTermProveedor}
                        setSearchTerm={setSearchTermProveedor}
                        suggestions={suggestionsProveedor}
                        setSuggestions={setSuggestionsProveedor}
                        handleSearchInputChange={(e) => setSearchTermProveedor(e.target.value)}
                        handleSearchKeyPress={(e) => {
                            if (e.key === 'Enter') performSearchProveedor(searchTermProveedor);
                        }}
                        handleSuggestionClick={handleSuggestionClickProveedor}
                    />
                    <SearchBar
                        searchTerm={searchTermCJMW}
                        setSearchTerm={setSearchTermCJMW}
                        suggestions={suggestionsCJMW}
                        setSuggestions={setSuggestionsCJMW}
                        handleSearchInputChange={(e) => setSearchTermCJMW(e.target.value)}
                        handleSearchKeyPress={(e) => {
                            if (e.key === 'Enter') performSearchCJMW(searchTermCJMW);
                        }}
                        handleSuggestionClick={handleSuggestionClickCJMW}
                    />
                </div>
            </div>

            {/* Botones de última búsqueda y mostrar todos */}
            <div className="flex justify-center space-x-4 my-4">
                {lastSearch && (
                    <button
                        onClick={() => {
                            if (lastSearch.startsWith("Proveedor: ")) {
                                performSearchProveedor(lastSearch.replace("Proveedor: ", ""));
                            } else {
                                performSearchCJMW(lastSearch.replace("CJMW: ", ""));
                            }
                        }}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 transition duration-200"
                    >
                        Última búsqueda: {lastSearch}
                    </button>
                )}
                {isSearchActive && (
                    <button
                        onClick={handleShowAll}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 transition duration-200"
                    >
                        Mostrar todos
                    </button>
                )}
            </div>

            {/* Tabla de equivalencias */}
            <div className="overflow-x-auto max-h-[50vh] md:max-h-[60vh]">
                <table className="min-w-full bg-white border border-gray-300 rounded-lg shadow-md">
                    <thead className="bg-gradient-to-r from-blue-400 to-purple-500 text-white">
                        <tr>
                            <th className="px-4 py-2 text-left font-semibold text-sm">NOMBRE CJMW</th>
                            <th className="px-4 py-2 text-left font-semibold text-sm">NOMBRE Proveedor</th>
                            <th className="px-4 py-2 text-left font-semibold text-sm">CodEquiv</th>
                            <th className="px-4 py-2 text-left font-semibold text-sm">RazProve</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEquivalencias.length > 0 ? (
                            filteredEquivalencias.map((equiv, index) => (
                                <tr key={index} className="hover:bg-blue-100">
                                    <td className="px-4 py-2 border-b text-sm">{equiv.desprodu}</td>
                                    <td className="px-4 py-2 border-b text-sm">{equiv.desequiv}</td>
                                    <td className="px-4 py-2 border-b text-sm">{equiv.codequiv}</td>
                                    <td className="px-4 py-2 border-b text-sm">{equiv.razprove}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="4" className="text-center py-4 text-gray-500">
                                    No se encontraron equivalencias.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Controles de paginación */}
            <div className="flex justify-center items-center space-x-4 mt-4">
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-4 py-2 bg-gray-300 rounded-lg shadow-md ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-400'
                        }`}
                >
                    Anterior
                </button>
                <span className="text-lg font-semibold">{currentPage}</span>
                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="px-4 py-2 bg-gray-300 rounded-lg shadow-md hover:bg-gray-400 transition duration-200"
                >
                    Siguiente
                </button>
            </div>
        </div>

    );
};

export default EquivalenciasTable;
