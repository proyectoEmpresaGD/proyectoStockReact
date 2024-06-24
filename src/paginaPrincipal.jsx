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
                console.log('Product data:', data);
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
            .then(data => {
                console.log('Stock data:', data);
                setStocks(data);
            })
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
            console.log('Combined data:', combined);
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
            console.log('Lotes del producto:', data);  // Verifica que los datos sean correctos
            setSelectedProductLots(Array.isArray(data) ? data : []);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching product lots data:', error);
        }
    };

    useEffect(() => {
        console.log('Lotes seleccionados:', selectedProductLots);
    }, [selectedProductLots]);

    const closeModal = () => {
        setModalVisible(false);
        setSelectedProductLots([]);
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
                    className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                    className="mb-4 px-4 py-2 bg-yellow-400 text-white rounded cursor-pointer hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-600"
                >
                    Última búsqueda: {lastSearch}
                </button>
            )}
            <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-4 py-2 border-b">Nombre</th>
                        <th className="px-4 py-2 border-b">Stock actual</th>
                        <th className="px-4 py-2 border-b">Stock pendiente recibir</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredProducts.map(product => (
                        <tr key={product.codprodu} className="border-b hover:bg-gray-100 cursor-pointer" onClick={() => handleProductClick(product.codprodu)}>
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
                        className="px-4 py-2 bg-blue-500 text-white rounded mr-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        Anterior
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="px-4 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        Siguiente
                    </button>
                </div>
            )}
            {singleProductView && (
                <button
                    onClick={handleShowAll}
                    className="mt-4 px-4 py-2 bg-green-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                    Mostrar todos
                </button>
            )}
            {modalVisible && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
                    <div className="bg-white p-4 rounded shadow-lg max-w-md w-full relative">
                        <h2 className="text-xl font-bold mb-4">Lotes del Producto</h2>
                        <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 hover:text-gray-800">&times;</button>
                        {Array.isArray(selectedProductLots) && selectedProductLots.length > 0 ? (
                            <table className="min-w-full bg-white border border-gray-300 text-sm">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 border-b">Lote</th>
                                        <th className="px-4 py-2 border-b">Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedProductLots.map((lot, index) => (
                                        <tr key={index} className="border-b">
                                            <td className="px-4 py-2">{lot.codlote}</td>
                                            <td className="px-4 py-2">{lot.stockactual}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div>No hay lotes disponibles.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Home;
