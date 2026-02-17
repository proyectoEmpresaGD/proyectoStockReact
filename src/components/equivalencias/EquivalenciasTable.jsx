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
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/equivalencias?limit=${itemsPerPage}&offset=${(currentPage - 1) * itemsPerPage}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
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
                    Authorization: `Bearer ${token}`,
                },
            })
                .then((response) => response.json())
                .then((data) => setSuggestionsProveedor(data))
                .catch((error) => console.error('Error fetching suggestions:', error));
        } else {
            setSuggestionsProveedor([]);
        }
    }, [searchTermProveedor, token]);

    // Búsqueda de sugerencias por CJMW
    useEffect(() => {
        if (searchTermCJMW.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${searchTermCJMW}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
                .then((response) => response.json())
                .then((data) => setSuggestionsCJMW(data))
                .catch((error) => console.error('Error fetching suggestions:', error));
        } else {
            setSuggestionsCJMW([]);
        }
    }, [searchTermCJMW, token]);

    // Función de búsqueda por proveedor
    const performSearchProveedor = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/search?query=${query}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then((response) => response.json())
            .then((data) => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true);
                setLastSearch(`Proveedor: ${query}`);
                setSearchTermProveedor('');
                setSuggestionsProveedor([]);
                setCurrentPage(1);
            })
            .catch((error) => console.error('Error performing search:', error));
    };

    // Función de búsqueda por CJMW
    const performSearchCJMW = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/equivalencias/searchCJMW?query=${query}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then((response) => response.json())
            .then((data) => {
                setFilteredEquivalencias(data);
                setIsSearchActive(true);
                setLastSearch(`CJMW: ${query}`);
                setSearchTermCJMW('');
                setSuggestionsCJMW([]);
                setCurrentPage(1);
            })
            .catch((error) => console.error('Error performing search:', error));
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
        <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div ref={searchBarRef} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
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

            <div className="my-4 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:gap-3">
                {lastSearch && (
                    <button
                        onClick={() => {
                            if (lastSearch.startsWith('Proveedor: ')) {
                                performSearchProveedor(lastSearch.replace('Proveedor: ', ''));
                            } else {
                                performSearchCJMW(lastSearch.replace('CJMW: ', ''));
                            }
                        }}
                        className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                        Última búsqueda: {lastSearch}
                    </button>
                )}
                {isSearchActive && (
                    <button
                        onClick={handleShowAll}
                        className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                        Mostrar todos
                    </button>
                )}
            </div>

            <div className="max-h-[50vh] overflow-x-auto md:max-h-[60vh] hidden md:block">
                <table className="min-w-full rounded-xl border border-slate-200 bg-white shadow-sm">
                    <thead className="bg-slate-900 text-white">
                        <tr>
                            <th className="px-4 py-2 text-left text-sm font-semibold">NOMBRE CJMW</th>
                            <th className="px-4 py-2 text-left text-sm font-semibold">NOMBRE Proveedor</th>
                            <th className="px-4 py-2 text-left text-sm font-semibold">CodEquiv</th>
                            <th className="px-4 py-2 text-left text-sm font-semibold">RazProve</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEquivalencias.length > 0 ? (
                            filteredEquivalencias.map((equiv, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                    <td className="border-b px-4 py-2 text-sm">{equiv.desprodu}</td>
                                    <td className="border-b px-4 py-2 text-sm">{equiv.desequiv}</td>
                                    <td className="border-b px-4 py-2 text-sm">{equiv.codequiv}</td>
                                    <td className="border-b px-4 py-2 text-sm">{equiv.razprove}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="4" className="py-4 text-center text-gray-500">
                                    No se encontraron equivalencias.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="space-y-2 md:hidden">
                {filteredEquivalencias.length > 0 ? (
                    filteredEquivalencias.map((equiv, index) => (
                        <article key={`${equiv.codequiv || 'equiv'}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre CJMW</p>
                            <p className="text-sm text-slate-900">{equiv.desprodu}</p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre proveedor</p>
                            <p className="text-sm text-slate-700">{equiv.desequiv}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CodEquiv</p>
                                    <p className="text-sm text-slate-700">{equiv.codequiv}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RazProve</p>
                                    <p className="text-sm text-slate-700">{equiv.razprove}</p>
                                </div>
                            </div>
                        </article>
                    ))
                ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                        No se encontraron equivalencias.
                    </div>
                )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium ${currentPage === 1
                        ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                >
                    Anterior
                </button>
                <span className="text-base font-semibold text-slate-700">{currentPage}</span>
                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="min-h-[44px] rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                    Siguiente
                </button>
            </div>
        </div>
    );
};

export default EquivalenciasTable;
