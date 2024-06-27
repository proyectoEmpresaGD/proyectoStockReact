import { useEffect, useState } from 'react';
import SearchBar from '../components/SearchBar';
import ProductTable from '../components/ProductTable';
import PaginationControls from '../components/PaginationControls';
import ProductModal from '../components/ProductModal';

function Home() {
    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [combinedProducts, setCombinedProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);
    const [lastSearch, setLastSearch] = useState('');
    const [singleProductView, setSingleProductView] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);

    const isValidProduct = (product) => {
        return (
            !/^(LIBRO|PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|QUALITY SAMPLE|PERCHA|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(product.desprodu) &&
            !/(PERCHAS Y LIBROS)/i.test(product.desprodu) &&
            !/CUTTING/i.test(product.desprodu) &&
            !/(LIBROS)/i.test(product.desprodu) &&
            !/PERCHA/i.test(product.desprodu) &&
            !/(PERCHAS)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCION)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCIÓN)/i.test(product.desprodu) &&
            ['ARE', 'FLA', 'CJM', 'HAR'].includes(product.codmarca)
        );
    };

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products?page=${currentPage}&limit=${itemsPerPage}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setProducts(data);
            } catch (error) {
                console.error('Error fetching product data:', error);
            }
        };
        fetchProducts();
    }, [currentPage, itemsPerPage]);

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => setStocks(data))
            .catch(error => console.error('Error fetching stock data:', error));
    }, []);

    useEffect(() => {
        if (products.length > 0 && stocks.length > 0) {
            const combined = products
                .filter(isValidProduct)
                .map(product => {
                    const stockData = stocks.find(stock => stock.codprodu === product.codprodu);
                    return {
                        ...product,
                        stockactual: stockData ? parseFloat(stockData.stockactual).toFixed(2) : 'N/A',
                        canpenrecib: stockData ? parseFloat(stockData.canpenrecib).toFixed(2) : 'N/A',
                    };
                });
            setCombinedProducts(combined);
            setFilteredProducts(combined); // Mostrar productos iniciales
        }
    }, [products, stocks]);

    useEffect(() => {
        if (searchTerm.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${searchTerm}&limit=4`)
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
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${query}&limit=${itemsPerPage}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                const combined = data
                    .filter(isValidProduct)
                    .map(product => {
                        const stockData = stocks.find(stock => stock.codprodu === product.codprodu);
                        return {
                            ...product,
                            stockactual: stockData ? parseFloat(stockData.stockactual).toFixed(2) : 'N/A',
                            canpenrecib: stockData ? parseFloat(stockData.canpenrecib).toFixed(2) : 'N/A',
                        };
                    });
                setFilteredProducts(combined);
                setSingleProductView(combined.length === 1);
            })
            .catch(error => console.error('Error performing search:', error));
    };

    const handleSuggestionClick = (product) => {
        const stockData = stocks.find(stock => stock.codprodu === product.codprodu);
        const combinedProduct = {
            ...product,
            stockactual: stockData ? parseFloat(stockData.stockactual).toFixed(2) : 'N/A',
            canpenrecib: stockData ? parseFloat(stockData.canpenrecib).toFixed(2) : 'N/A',
        };
        setFilteredProducts([combinedProduct]);
        setLastSearch(product.desprodu);
        setSingleProductView(true);
        setSearchTerm('');
        setSuggestions([]);
    };

    const handleShowAll = () => {
        setSearchTerm('');
        setFilteredProducts(combinedProducts);
        setSingleProductView(false);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleLastSearchClick = () => {
        performSearch(lastSearch);
        setSearchTerm('');
    };

    const handleProductClick = async (codprodu) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${codprodu}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setSelectedProductLots(Array.isArray(data) ? data : []);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching product lots data:', error);
        }
    };

    const closeModal = () => {
        setModalVisible(false);
        setSelectedProductLots([]);
    };

    return (
        <div className="container mx-auto justify-center text-center px-2 py-4">
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
            <ProductTable products={filteredProducts} handleProductClick={handleProductClick} />
            {!singleProductView && (
                <PaginationControls currentPage={currentPage} handlePageChange={handlePageChange} />
            )}
            {singleProductView && (
                <button
                    onClick={handleShowAll}
                    className="mt-4 px-4 py-2 bg-green-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                    Mostrar todos
                </button>
            )}
            <ProductModal
                modalVisible={modalVisible}
                selectedProductLots={selectedProductLots}
                closeModal={closeModal}
            />
        </div>
    );
}

export default Home;
