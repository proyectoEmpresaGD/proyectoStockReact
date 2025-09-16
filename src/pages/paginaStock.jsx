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

    // Límite alto para traer todos los resultados de búsqueda (la paginación se hace en cliente)
    const SEARCH_FETCH_LIMIT = 5000; // ajusta si esperas más/menos resultados máximos

    // --- Estados de datos y carga/errores ---
    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [stockLotes, setStockLotes] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingStock, setLoadingStock] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);
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
    const [lastSearchResultsRaw, setLastSearchResultsRaw] = useState([]);
    const [singleProductView, setSingleProductView] = useState(false);

    // --- Modal de lotes ---
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);

    const wrapperRef = useRef(null);

    // Refs para abortar peticiones en curso (sugerencias / búsqueda)
    const suggestAbortRef = useRef(null);
    const searchAbortRef = useRef(null);

    // --- Índices O(1) por codprodu para computar más rápido ---
    const stockByProd = useMemo(() => {
        const map = new Map();
        for (const s of stocks) map.set(s.codprodu, s);
        return map;
    }, [stocks]);

    const lotsByProd = useMemo(() => {
        const map = new Map();
        for (const l of stockLotes) {
            if (!map.has(l.codprodu)) map.set(l.codprodu, []);
            map.get(l.codprodu).push(l);
        }
        return map;
    }, [stockLotes]);

    // --- Filtro de productos válidos (se mantiene sin cambios) ---
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
                const s = stockByProd.get(p.codprodu);
                const lots = lotsByProd.get(p.codprodu) ?? [];
                const total = lots.length
                    ? lots.reduce((sum, l) => sum + parseFloat(l.stockactual || 0), 0)
                    : s
                        ? parseFloat(s.stockactual || 0)
                        : 0;
                return {
                    ...p,
                    stockactual: total.toFixed(2),
                    canpenrecib: s ? parseFloat(s.canpenrecib || 0).toFixed(2) : '0.00',
                    canpenservir: s ? parseFloat(s.canpenservir || 0).toFixed(2) : '0.00'
                };
            }),
        [stockByProd, lotsByProd, isValidProduct]
    );

    const combinedProducts = useMemo(() => {
        if (!products.length || !stocks.length || !stockLotes.length) return [];
        return computeCombined(products);
    }, [products, stocks, stockLotes, computeCombined]);

    // Actualizamos los filtrados cuando cambia la combinación
    useEffect(() => {
        if (!isSearchActive) setFilteredProducts(combinedProducts);
    }, [combinedProducts, isSearchActive]);

    // Si estoy en modo búsqueda y llegan (o cambian) stocks/lotes, recomputo
    useEffect(() => {
        if (isSearchActive && lastSearchResultsRaw.length) {
            setFilteredProducts(computeCombined(lastSearchResultsRaw));
        }
    }, [isSearchActive, lastSearchResultsRaw, computeCombined]);

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

    // --- Sugerencias de búsqueda con debounce y abort ---
    useEffect(() => {
        if (searchTerm.length < 3 || !token) {
            // Cancelar en curso y limpiar
            suggestAbortRef.current?.abort?.();
            setSuggestions([]);
            return;
        }

        const controller = new AbortController();
        suggestAbortRef.current?.abort?.();
        suggestAbortRef.current = controller;

        const timeout = setTimeout(() => {
            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                    searchTerm
                )}&limit=200`,
                { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
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
                .catch(() => {
                    /* ignoramos aborts/errores silenciosamente */
                });
        }, 250); // debounce 250ms

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [searchTerm, token, isValidProduct, fuzzyFilter]);

    // --- Ejecutar búsqueda (traemos muchos resultados y paginamos en cliente) ---
    const performSearch = useCallback(
        query => {
            const q = (query || '').trim();
            if (!q) return;

            setLoadingSearch(true);
            // Cancelar búsqueda previa
            searchAbortRef.current?.abort?.();
            const controller = new AbortController();
            searchAbortRef.current = controller;

            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                    q
                )}&limit=${SEARCH_FETCH_LIMIT}`,
                { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
            )
                .then(res => {
                    if (!res.ok) throw new Error();
                    return res.json();
                })
                .then(data => {
                    setLastSearchResultsRaw(data);
                    const combined = computeCombined(data);
                    setFilteredProducts(combined);
                    setSingleProductView(combined.length === 1);
                    setIsSearchActive(true);
                    setLastSearch(q);
                    setCurrentPage(1);
                })
                .catch(() => {
                    /* ignoramos aborts/errores silenciosamente */
                })
                .finally(() => setLoadingSearch(false));
        },
        [token, computeCombined, SEARCH_FETCH_LIMIT]
    );

    // --- Manejadores (Enter solo lanza tu búsqueda) ---
    const handleSearchKeyPress = e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
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
        setFilteredProducts(combinedProducts);
        setIsSearchActive(false);
        setLastSearchResultsRaw([]);
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

    // --- Hook para capturar Enter y desactivar autocomplete del navegador sin tocar SearchBar ---
    useEffect(() => {
        const root = wrapperRef.current;
        if (!root) return;

        const input = root.querySelector('input');
        if (!input) return;

        input.setAttribute('autocomplete', 'off');

        const onKeyDown = e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const value = input.value ?? '';
                if (value.trim().length > 0) {
                    performSearch(value.trim());
                    setSuggestions([]);
                    setSearchTerm('');
                }
            }
            // Si tu lista de sugerencias "captura" flechas y te molesta, puedes bloquearlas:
            // if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault();
        };

        input.addEventListener('keydown', onKeyDown);
        return () => input.removeEventListener('keydown', onKeyDown);
    }, [performSearch]);

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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {lastSearch && (
                            <button
                                onClick={() => performSearch(lastSearch)}
                                disabled={loadingSearch}
                                className="inline-flex items-center px-4 py-2 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-white rounded-full shadow-sm transition"
                            >
                                Última búsqueda:&nbsp;
                                <span className="italic">“{lastSearch}”</span>
                            </button>
                        )}
                        {isSearchActive && (
                            <button
                                onClick={clearSearch}
                                disabled={loadingSearch}
                                className="inline-flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-full shadow-sm transition"
                            >
                                <AiOutlineCloseCircle className="mr-2 text-lg" />
                                Limpiar búsqueda
                            </button>
                        )}
                        {isSearchActive && (
                            <span className="text-sm text-gray-600 ml-auto">
                                {filteredProducts.length} resultado{filteredProducts.length === 1 ? '' : 's'}
                            </span>
                        )}
                        {loadingSearch && (
                            <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                                <AiOutlineLoading3Quarters className="animate-spin" />
                                Buscando…
                            </span>
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
                        {isSearchActive && !pagedProducts.length && (
                            <p className="text-center text-gray-600 my-6">
                                No hay resultados para “{lastSearch}”.
                            </p>
                        )}
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
