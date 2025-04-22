// src/pages/paginaStock.jsx
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
    const [suggestions, setSuggestions] = useState([]);

    const [filteredProducts, setFilteredProducts] = useState([]);
    const [isSearchActive, setIsSearchActive] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [totalProducts, setTotalProducts] = useState(0);

    const [lastSearch, setLastSearch] = useState('');
    const [singleProductView, setSingleProductView] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);

    const searchBarRef = useRef(null);

    // AHORA INCLUYE 'BAS' TAMBIÉN
    const isValidProduct = (p) =>
        ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(p.codmarca) &&
        !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(p.desprodu) &&
        !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(p.desprodu);

    // 1) Productos paginados
    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/products?page=${currentPage}&limit=${itemsPerPage}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error(res.status);
                const { products: prods, total } = await res.json();
                setProducts(prods || []);
                setTotalProducts(total || 0);
            } catch (err) {
                console.error('Error fetching products:', err);
            }
        })();
    }, [token, currentPage]);

    // 2) Stock / lotes
    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const [sRes, lRes] = await Promise.all([
                    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocklotes`, { headers: { Authorization: `Bearer ${token}` } })
                ]);
                if (!sRes.ok || !lRes.ok) throw new Error('Stock fetch failed');
                setStocks(await sRes.json());
                setStockLotes(await lRes.json());
            } catch (err) {
                console.error('Error fetching stock/lotes:', err);
            }
        })();
    }, [token]);

    // 3) Combinar
    useEffect(() => {
        if (!products.length || !stocks.length || !stockLotes.length) return;
        const combined = products
            .filter(isValidProduct)
            .map(p => {
                const s = stocks.find(x => x.codprodu === p.codprodu);
                const lots = stockLotes.filter(l => l.codprodu === p.codprodu);
                const total = lots.length
                    ? lots.reduce((sum, l) => sum + parseFloat(l.stockactual), 0)
                    : (s ? parseFloat(s.stockactual) : 0);
                return {
                    ...p,
                    stockactual: total.toFixed(2),
                    canpenrecib: s ? parseFloat(s.canpenrecib).toFixed(2) : '0.00',
                    canpenservir: s ? parseFloat(s.canpenservir).toFixed(2) : '0.00'
                };
            });
        setCombinedProducts(combined);
        setFilteredProducts(combined);
    }, [products, stocks, stockLotes]);

    // Fuzzy helper
    const fuzzyFilter = (p, term) => {
        const tokens = term.toLowerCase().split(' ').filter(Boolean);
        return tokens.every(t => p.desprodu.toLowerCase().includes(t));
    };

    // 4) Sugerencias
    useEffect(() => {
        if (searchTerm.length < 3) {
            setSuggestions([]);
            return;
        }
        (async () => {
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(searchTerm)}&limit=40`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error(res.status);
                const data = await res.json();
                setSuggestions(
                    data.filter(isValidProduct).filter(p => fuzzyFilter(p, searchTerm))
                );
            } catch (err) {
                console.error('Error fetching suggestions:', err);
                setSuggestions([]);
            }
        })();
    }, [searchTerm, token]);

    // Búsqueda general
    const performSearch = async (query) => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(query)}&limit=${itemsPerPage}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            const combined = data
                .filter(isValidProduct)
                .map(p => {
                    const s = stocks.find(x => x.codprodu === p.codprodu);
                    const lots = stockLotes.filter(l => l.codprodu === p.codprodu);
                    const total = lots.length
                        ? lots.reduce((sum, l) => sum + parseFloat(l.stockactual), 0)
                        : (s ? parseFloat(s.stockactual) : 0);
                    return {
                        ...p,
                        stockactual: total.toFixed(2),
                        canpenrecib: s ? parseFloat(s.canpenrecib).toFixed(2) : '0.00',
                        canpenservir: s ? parseFloat(s.canpenservir).toFixed(2) : '0.00'
                    };
                });
            setFilteredProducts(combined);
            setSingleProductView(combined.length === 1);
            setIsSearchActive(true);
            setLastSearch(query);
        } catch (err) {
            console.error('Error performing search:', err);
        }
    };

    const handleSearchKeyPress = e => {
        if (e.key === 'Enter') {
            performSearch(searchTerm);
            setSuggestions([]);    // <--- también limpio sugerencias
            setSearchTerm('');
        }
    };

    const handleSuggestionClick = p => {
        performSearch(p.desprodu);
        setSuggestions([]);
        setSearchTerm('');
    };

    const handleLastSearchClick = () => lastSearch && performSearch(lastSearch);
    const handleShowAllProducts = () => {
        setFilteredProducts(combinedProducts);
        setSingleProductView(false);
        setIsSearchActive(false);
    };

    const handlePageChange = p => {
        setCurrentPage(p);
        handleShowAllProducts();
    };

    const handleProductClick = async p => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${p.codprodu}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error(res.status);
            setSelectedProductLots(await res.json());
            setModalVisible(true);
        } catch (err) {
            console.error('Error fetching product lots:', err);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6">
            <div className="container mx-auto bg-white p-6 rounded-lg shadow-lg max-w-screen-lg mt-8">
                <h1 className="text-3xl font-bold text-center mb-4">Stock</h1>
                <p className="text-center text-gray-600 mb-6">
                    Gestiona y consulta el inventario de productos y sus lotes.
                </p>

                <div ref={searchBarRef} className="mb-6">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSearchInputChange={e => setSearchTerm(e.target.value)}
                        handleSearchKeyPress={handleSearchKeyPress}
                        handleSuggestionClick={handleSuggestionClick}
                    />
                </div>

                <div className="flex flex-wrap justify-center gap-4 mb-6">
                    {lastSearch && (
                        <button
                            onClick={handleLastSearchClick}
                            className="px-4 py-2 bg-yellow-500 text-white rounded shadow"
                        >
                            Última búsqueda: "{lastSearch}"
                        </button>
                    )}
                    {isSearchActive && (
                        <button
                            onClick={handleShowAllProducts}
                            className="px-4 py-2 bg-blue-500 text-white rounded shadow"
                        >
                            Mostrar todos
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto mb-6">
                    <ProductTable
                        products={filteredProducts}
                        handleProductClick={handleProductClick}
                    />
                </div>

                {!singleProductView && (
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={Math.ceil(totalProducts / itemsPerPage)}
                        handlePageChange={handlePageChange}
                    />
                )}

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
