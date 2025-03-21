import { useEffect, useState, useRef } from 'react';
import SearchBar from '../components/productos/SearchBar';
import ProductTable from '../components/productos/ProductTable';
import PaginationControls from '../components/PaginationControls';
import ProductModal from '../components/productos/ProductModal';
import { useAuthContext } from '../Auth/AuthContext';

function Stock() {
    const { token } = useAuthContext();
    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [stockLotes, setStockLotes] = useState([]);
    const [combinedProducts, setCombinedProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [totalProducts, setTotalProducts] = useState(0);
    const [lastSearch, setLastSearch] = useState('');
    const [singleProductView, setSingleProductView] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const searchBarRef = useRef(null);

    const isValidProduct = (product) => {
        return (
            !/^(LIBRO|PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|QUALITY SAMPLE|PERCHA|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCION)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCIÓN)/i.test(product.desprodu) &&
            ['ARE', 'FLA', 'CJM', 'HAR'].includes(product.codmarca)
        );
    };

    // Fetch de productos con token y paginación
    useEffect(() => {
        if (!token) return;

        const fetchProducts = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products?page=${currentPage}&limit=${itemsPerPage}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setProducts(data.products || []);
                setTotalProducts(data.total || 0);
            } catch (error) {
                console.error('Error fetching product data:', error);
            }
        };

        fetchProducts();
    }, [currentPage, itemsPerPage, token]);

    // Fetch de stock
    useEffect(() => {
        if (!token) return;

        const fetchStock = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setStocks(data || []);
            } catch (error) {
                console.error('Error fetching stock data:', error);
            }
        };

        fetchStock();
    }, [token]);

    // Fetch de lotes de stock
    useEffect(() => {
        if (!token) return;

        const fetchStockLotes = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocklotes`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setStockLotes(data || []);
            } catch (error) {
                console.error('Error fetching stock lotes data:', error);
            }
        };

        fetchStockLotes();
    }, [token]);

    // Combinar productos, stock y lotes
    useEffect(() => {
        if (products.length > 0 && stocks.length > 0 && stockLotes.length > 0) {
            const combined = products
                .filter(isValidProduct)
                .map(product => {
                    const stock = stocks.find(s => s.codprodu === product.codprodu);
                    const lotes = stockLotes.filter(l => l.codprodu === product.codprodu);
                    let totalStockActual = 0;

                    if (lotes.length > 0) {
                        totalStockActual = lotes.reduce((acc, lote) => acc + parseFloat(lote.stockactual), 0);
                    } else if (stock) {
                        totalStockActual = parseFloat(stock.stockactual);
                    }

                    return {
                        ...product,
                        stockactual: totalStockActual.toFixed(2),
                        canpenrecib: stock ? parseFloat(stock.canpenrecib).toFixed(2) : 'N/A',
                    };
                });
            setCombinedProducts(combined);
            setFilteredProducts(combined);
        }
    }, [products, stocks, stockLotes]);

    // Función para realizar un filtrado "fuzzy" en base al término de búsqueda.
    const fuzzyFilter = (product, searchTerm) => {
        const tokens = searchTerm.toLowerCase().split(' ').filter(Boolean);
        const productText = product.desprodu.toLowerCase();
        return tokens.every(token => productText.includes(token));
    };

    // Sugerencias al escribir en el buscador (modificado para realizar filtrado difuso)
    useEffect(() => {
        if (searchTerm.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${searchTerm}&limit=40`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Aplicar filtrado difuso sobre los datos obtenidos
                    const fuzzySuggestions = data.filter(product => fuzzyFilter(product, searchTerm));
                    setSuggestions(fuzzySuggestions);
                })
                .catch(error => {
                    console.error('Error fetching search suggestions:', error);
                    setSuggestions([]);
                });
        } else {
            setSuggestions([]);
        }
    }, [searchTerm, token]);

    const performSearch = (query) => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${query}&limit=${itemsPerPage}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && Array.isArray(data)) {
                    const combined = data
                        .filter(isValidProduct)
                        .map(product => {
                            const stock = stocks.find(s => s.codprodu === product.codprodu);
                            const lotes = stockLotes.filter(l => l.codprodu === product.codprodu);

                            let totalStockActual = 0;
                            if (lotes.length > 0) {
                                totalStockActual = lotes.reduce((acc, lote) => acc + parseFloat(lote.stockactual), 0);
                            } else if (stock) {
                                totalStockActual = parseFloat(stock.stockactual);
                            }

                            return {
                                ...product,
                                stockactual: totalStockActual.toFixed(2),
                                canpenrecib: stock ? parseFloat(stock.canpenrecib).toFixed(2) : 'N/A',
                            };
                        });
                    setFilteredProducts(combined);
                    setSingleProductView(combined.length === 1);
                    setIsSearchActive(true);
                    setSuggestions([]); // Cerrar sugerencias después de la búsqueda
                } else {
                    setFilteredProducts([]);
                }
            })
            .catch(error => {
                console.error('Error performing search:', error);
            });
    };

    // Manejar clic en sugerencia
    const handleSuggestionClick = (product) => {
        setLastSearch(product.desprodu);
        performSearch(product.desprodu);
        setSearchTerm('');  // Limpiar el campo de búsqueda
        setSuggestions([]); // Cerrar las sugerencias
    };

    // Manejar clic en el botón de última búsqueda
    const handleLastSearchClick = () => {
        if (lastSearch) {
            performSearch(lastSearch);
        }
    };

    // Mostrar todos los productos
    const handleShowAllProducts = () => {
        setFilteredProducts(combinedProducts);
        setSingleProductView(false);
        setIsSearchActive(false);
    };

    // Manejo de cambio de página
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    // Manejar clic en producto para abrir el modal
    const handleProductClick = async (product) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${product.codprodu}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setSelectedProductLots(data || []);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching product lots:', error);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-8">
                <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-gray-700">
                    Stock
                </h1>
                <p className="text-lg md:text-xl mb-6 text-center text-gray-600">
                    Gestiona y consulta el inventario de productos y sus lotes.
                </p>

                {/* Barra de búsqueda */}
                <div ref={searchBarRef} className="mb-6">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSearchInputChange={(e) => setSearchTerm(e.target.value)}
                        handleSearchKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                setLastSearch(searchTerm);
                                performSearch(searchTerm);
                                setSearchTerm('');
                                setSuggestions([]);
                            }
                        }}
                        handleSuggestionClick={handleSuggestionClick}
                    />
                </div>

                {/* Botones de acciones */}
                <div className="flex flex-col md:flex-row justify-center items-center space-y-4 md:space-y-0 md:space-x-4 mb-6">
                    {lastSearch && (
                        <button
                            onClick={handleLastSearchClick}
                            className="px-4 py-2 bg-yellow-400 text-white rounded-lg cursor-pointer hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-600 transition duration-200"
                        >
                            Última búsqueda: {lastSearch}
                        </button>
                    )}
                    {isSearchActive && (
                        <button
                            onClick={handleShowAllProducts}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition duration-200"
                        >
                            Mostrar todos los productos
                        </button>
                    )}
                </div>

                {/* Tabla de productos */}
                <div className="mb-6 overflow-x-auto">
                    <ProductTable products={filteredProducts} handleProductClick={handleProductClick} />
                </div>

                {/* Controles de paginación */}
                {!singleProductView && (
                    <PaginationControls
                        currentPage={currentPage}
                        handlePageChange={handlePageChange}
                        totalPages={Math.ceil(totalProducts / itemsPerPage)}
                    />
                )}

                {/* Modal de productos */}
                {modalVisible && (
                    <ProductModal
                        modalVisible={modalVisible}
                        selectedProductLots={selectedProductLots}
                        closeModal={() => setModalVisible(false)}
                    />
                )}
            </div>
        </div>
    );
}

export default Stock;
