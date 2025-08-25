// src/pages/paginaStock.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import SearchBar from '../components/productos/SearchBar';
import ProductTable from '../components/productos/ProductTable';
import PaginationControls from '../components/PaginationControls';
import ProductModal from '../components/productos/ProductModal';
import { useAuthContext } from '../Auth/AuthContext';
import { AiOutlineLoading3Quarters, AiOutlineCloseCircle } from 'react-icons/ai';

function Stock() {
    const { token } = useAuthContext();

    // --- Estados de datos y carga/errores ---
    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [stockLotes, setStockLotes] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingStock, setLoadingStock] = useState(false);
    const [error, setError] = useState(null);

    // --- Productos combinados y filtrados ---
    const [filteredProducts, setFilteredProducts] = useState([]);

    // --- Paginación ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [totalProducts, setTotalProducts] = useState(0);

    // --- Búsqueda ---
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [lastSearch, setLastSearch] = useState('');
    const [singleProductView, setSingleProductView] = useState(false);

    // --- Modal de lotes ---
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);

    const wrapperRef = useRef(null);

    // --- Filtro de productos válidos ---
    const isValidProduct = useCallback(
        p =>
            ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(p.codmarca) &&
            !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(
                p.desprodu
            ) &&
            !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(p.desprodu),
        []
    );

    // --- Combinar productos con stock ---
    const computeCombined = useCallback(
        prods =>
            prods.filter(isValidProduct).map(p => {
                const s = stocks.find(x => x.codprodu === p.codprodu);
                const lots = stockLotes.filter(l => l.codprodu === p.codprodu);
                const total = lots.length
                    ? lots.reduce((sum, l) => sum + parseFloat(l.stockactual), 0)
                    : s
                        ? parseFloat(s.stockactual)
                        : 0;
                return {
                    ...p,
                    stockactual: total.toFixed(2),
                    canpenrecib: s ? parseFloat(s.canpenrecib).toFixed(2) : '0.00',
                    canpenservir: s ? parseFloat(s.canpenservir).toFixed(2) : '0.00'
                };
            }),
        [stocks, stockLotes, isValidProduct]
    );

    const combinedProducts = useMemo(() => {
        if (!products.length || !stocks.length || !stockLotes.length) return [];
        return computeCombined(products);
    }, [products, stocks, stockLotes, computeCombined]);

    // Actualizamos los filtrados cuando cambia la combinación
    useEffect(() => {
        setFilteredProducts(combinedProducts);
    }, [combinedProducts]);

    // --- Cálculo de qué mostrar en la tabla ---
    const pagedProducts = useMemo(() => {
        if (!isSearchActive) return combinedProducts;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    }, [isSearchActive, filteredProducts, combinedProducts, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        const count = isSearchActive ? filteredProducts.length : totalProducts;
        return Math.max(1, Math.ceil(count / itemsPerPage));
    }, [isSearchActive, filteredProducts.length, totalProducts, itemsPerPage]);

    // --- Fetch productos paginados (modo normal) ---
    useEffect(() => {
        if (!token || isSearchActive) return;
        setLoadingProducts(true);
        setError(null);
        fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/products?page=${currentPage}&limit=${itemsPerPage}`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
            .then(res => {
                if (!res.ok) throw new Error('Error loading products');
                return res.json();
            })
            .then(({ products: prods, total }) => {
                setProducts(prods);
                setTotalProducts(total);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoadingProducts(false));
    }, [token, currentPage, isSearchActive, itemsPerPage]);

    // --- Fetch stock y lotes ---
    useEffect(() => {
        if (!token) return;
        setLoadingStock(true);
        setError(null);
        Promise.all([
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (!res.ok) throw new Error('Error loading stock');
                return res.json();
            }),
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stocklotes`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (!res.ok) throw new Error('Error loading lotes');
                return res.json();
            })
        ])
            .then(([sData, lData]) => {
                setStocks(sData);
                setStockLotes(lData);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoadingStock(false));
    }, [token]);

    // --- Filtro difuso para sugerencias ---
    const fuzzyFilter = useCallback(
        (p, term) =>
            term
                .toLowerCase()
                .split(' ')
                .filter(Boolean)
                .every(t => p.desprodu.toLowerCase().includes(t)),
        []
    );

    // --- Sugerencias de búsqueda ---
    useEffect(() => {
        if (searchTerm.length < 3) {
            setSuggestions([]);
            return;
        }
        fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                searchTerm
            )}&limit=40`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data =>
                setSuggestions(
                    data.filter(isValidProduct).filter(p => fuzzyFilter(p, searchTerm))
                )
            )
            .catch(() => setSuggestions([]));
    }, [searchTerm, token, isValidProduct, fuzzyFilter]);

    // --- Ejecutar búsqueda ---
    const performSearch = useCallback(
        query => {
            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                    query
                )}&limit=${itemsPerPage}`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
                .then(res => {
                    if (!res.ok) throw new Error();
                    return res.json();
                })
                .then(data => {
                    const combined = computeCombined(data);
                    setFilteredProducts(combined);
                    setSingleProductView(combined.length === 1);
                    setIsSearchActive(true);
                    setLastSearch(query);
                    setCurrentPage(1);
                })
                .catch(err => console.error('Search error', err));
        },
        [token, computeCombined, itemsPerPage]
    );

    // Manejadores
    const handleSearchKeyPress = e => {
        if (e.key === 'Enter') {
            performSearch(searchTerm);
            setSuggestions([]);
            setSearchTerm('');
        }
    };
    const handleSuggestionClickLocal = p => {
        performSearch(p.desprodu);
        setSuggestions([]);
        setSearchTerm('');
    };
    const clearSearch = () => {
        // Ya no reseteamos lastSearch para mantener el botón visible
        setFilteredProducts(combinedProducts);
        setIsSearchActive(false);
        setSearchTerm('');
        setCurrentPage(1);
    };
    const handlePageChange = pageNum => {
        const p = Math.max(1, Math.min(pageNum, totalPages));
        setCurrentPage(p);
    };
    const handleProductClick = async p => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${p.codprodu}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSelectedProductLots(data);
            setModalVisible(true);
        } catch {
            console.error('Error fetching lots');
        }
    };

    const anyLoading = loadingProducts || loadingStock;

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6">
            <div className="container mx-auto bg-white p-6 rounded-lg shadow-lg max-w-screen-lg mt-20">
                <h1 className="text-3xl font-bold text-center mb-4">Stock</h1>
                <p className="text-center text-gray-600 mb-6">
                    Gestiona y consulta el inventario de productos y sus lotes.
                </p>

                {/* Búsqueda y controles */}
                <div ref={wrapperRef} className="mb-6">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSearchInputChange={e => setSearchTerm(e.target.value)}
                        handleSearchKeyPress={handleSearchKeyPress}
                        handleSuggestionClick={handleSuggestionClickLocal}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                        {lastSearch && (
                            <button
                                onClick={() => performSearch(lastSearch)}
                                className="inline-flex items-center px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-white rounded-full shadow-sm transition"
                            >
                                Última búsqueda:&nbsp;
                                <span className="italic">“{lastSearch}”</span>
                            </button>
                        )}
                        {isSearchActive && (
                            <button
                                onClick={clearSearch}
                                className="inline-flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-sm transition"
                            >
                                <AiOutlineCloseCircle className="mr-2 text-lg" />
                                Limpiar búsqueda
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                {anyLoading ? (
                    <div className="flex justify-center py-10">
                        <AiOutlineLoading3Quarters className="animate-spin text-3xl text-blue-500" />
                    </div>
                ) : (
                    <>
                        <ProductTable
                            products={pagedProducts}
                            handleProductClick={handleProductClick}
                        />
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            handlePageChange={handlePageChange}
                        />
                    </>
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