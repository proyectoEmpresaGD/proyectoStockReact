import { useEffect, useState } from 'react';

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

    // Obtener datos de productos con paginación
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products?page=${currentPage}&limit=${itemsPerPage}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                console.log('Product data:', data);
                setProducts(data);
            } catch (error) {
                console.error('Error fetching product data:', error);
            }
        };
        fetchProducts();
    }, [currentPage, itemsPerPage]);

    // Obtener datos de stock
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Stock data:', data);
                setStocks(data);
            })
            .catch(error => console.error('Error fetching stock data:', error));
    }, []);

    // Combinar datos de productos y stock
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
            console.log('Combined data:', combined);
            setCombinedProducts(combined);
            setFilteredProducts(combined); // Mostrar productos iniciales
        }
    }, [products, stocks]);

    // Obtener sugerencias de búsqueda
    useEffect(() => {
        if (searchTerm.length >= 3) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${searchTerm}&limit=4`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    setSuggestions(data);
                })
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
                setFilteredProducts(data);
                setSingleProductView(data.length === 1);
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

    return (
        <div className="container mx-auto justify-center text-center px-2 py-4">
            <div className="relative mb-4">
                <input
                    type="text"
                    placeholder="Buscar por Nombre"
                    value={searchTerm}
                    onChange={handleSearchInputChange}
                    onKeyPress={handleSearchKeyPress}
                    className="w-full p-2 border rounded text-center border-black text-white font-bold bg-black"
                />
                {suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 mt-2 bg-white border border-gray-300 rounded shadow-lg">
                        {suggestions.map(product => (
                            <li
                                key={product.codprodu}
                                className="p-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() => handleSuggestionClick(product)}
                            >
                                <div className="font-bold">{product.desprodu}</div>
                                <div className="text-sm text-gray-600">{product.codprodu}</div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {lastSearch && (
                <button
                    onClick={handleLastSearchClick}
                    className="mb-4 px-4 py-2 bg-yellow-400 text-white rounded cursor-pointer hover:bg-yellow-500"
                >
                    Última búsqueda: {lastSearch}
                </button>
            )}
            <table className="min-w-full bg-white border font-bold border-black text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-4 py-2 border-b">Nombre</th>
                        <th className="px-4 py-2 border-b">Stock actual</th>
                        <th className="px-4 py-2 border-b">Stock pendiente recibir</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredProducts.map(product => (
                        <tr key={product.codprodu} className="border-b hover:bg-gray-100">
                            <td className="px-4 py-2">{product.desprodu}</td>
                            <td className="px-4 py-2">{product.stockactual} m</td>
                            <td className="px-4 py-2">{product.canpenrecib} m</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {!singleProductView && (
                <div className="mt-4 flex justify-center">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-gray-300 rounded mr-2 disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="px-4 py-2 bg-gray-300 rounded"
                    >
                        Siguiente
                    </button>
                </div>
            )}
            {singleProductView && (
                <button
                    onClick={handleShowAll}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
                >
                    Mostrar todos
                </button>
            )}
        </div>
    );
}

export default Home;
