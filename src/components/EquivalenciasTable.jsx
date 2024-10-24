import { useEffect, useState, useRef } from 'react';
import SearchBarEquivalencias from './SearchBarEquivalencias';
import SearchBar from './SearchBar';
import { useAuthContext } from '../AuthContext';

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

    // Cerrar sugerencias al hacer clic fuera del input
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

    // Si el usuario no tiene acceso, mostrar un mensaje de error
    if (user && user.role !== 'almacen' && user.role !== 'admin') {
        return <div className="text-center text-red-500">Acceso denegado. No tienes permisos para ver las equivalencias.</div>;
    }

    return (
        <div className="md:mt-[8%] container mx-auto p-2 bg-white shadow-md rounded-lg">
            <div ref={searchBarRef} className="space-y-0">
                <div className="grid grid-cols-1 mt-[20%] md:mt-0 lg:grid-cols-2 gap-0">
                    <SearchBarEquivalencias
                        searchTerm={searchTermProveedor}
                        setSearchTerm={setSearchTermProveedor}
                        suggestions={suggestionsProveedor}
                        handleSearchInputChange={(e) => setSearchTermProveedor(e.target.value)}
                        handleSearchKeyPress={(e) => { if (e.key === 'Enter') performSearchProveedor(searchTermProveedor); }}
                        handleSuggestionClick={handleSuggestionClickProveedor}
                    />
                    <SearchBar
                        searchTerm={searchTermCJMW}
                        setSearchTerm={setSearchTermCJMW}
                        suggestions={suggestionsCJMW}
                        handleSearchInputChange={(e) => setSearchTermCJMW(e.target.value)}
                        handleSearchKeyPress={(e) => { if (e.key === 'Enter') performSearchCJMW(searchTermCJMW); }}
                        handleSuggestionClick={handleSuggestionClickCJMW}
                    />
                </div>
            </div>
            <div className=' grid grid-cols-2'>
                {/* Mostrar la última búsqueda si existe */}
                {lastSearch && (
                    <button
                        onClick={() => {
                            if (lastSearch.startsWith("Proveedor: ")) {
                                performSearchProveedor(lastSearch.replace("Proveedor: ", ""));
                            } else {
                                performSearchCJMW(lastSearch.replace("CJMW: ", ""));
                            }
                        }}
                        className=" px-4 py-2 bg-green-500 text-white rounded cursor-pointer hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300"
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
            {/* Ajustar la tabla para que sea más pequeña */}
            <div className="overflow-y-auto h-full max-h-[50vh] md:max-h-[60vh] mt-2 max-w-full">
                <table className="min-w-full bg-white border border-gray-300 rounded-lg shadow-sm">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-2 py-2 border-b md:text-sm text-xs font-semibold text-left">NOMBRE CJMW</th>
                            <th className="px-2 py-2 border-b font-semibold text-left md:text-sm text-xs">NOMBRE Proveedor</th>
                            <th className="px-2 py-2 border-b font-semibold text-left md:text-sm text-xs">CodEquiv</th>
                            <th className="px-2 py-2 border-b font-semibold text-left md:text-sm text-xs">RazProve</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEquivalencias.length > 0 ? (
                            filteredEquivalencias.map((equiv, index) => (
                                <tr key={index} className="hover:bg-gray-100">
                                    <td className="px-2 py-2 border-b md:text-sm text-xs">{equiv.desprodu}</td>
                                    <td className="px-2 py-2 border-b md:text-sm text-xs">{equiv.desequiv}</td>
                                    <td className="px-2 py-2 border-b md:text-sm text-xs">{equiv.codequiv}</td>
                                    <td className="px-2 py-2 border-b md:text-sm text-xs">{equiv.razprove}</td>
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

            <div className="flex justify-center mt-0">
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
        </div>
    );
};

export default EquivalenciasTable;
