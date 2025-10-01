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

    const SEARCH_FETCH_LIMIT = 5000;

    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingStock, setLoadingStock] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [error, setError] = useState(null);

    const [filteredProducts, setFilteredProducts] = useState([]);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [totalProducts, setTotalProducts] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [lastSearch, setLastSearch] = useState('');
    const [lastSearchResultsRaw, setLastSearchResultsRaw] = useState([]);
    const [singleProductView, setSingleProductView] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedProductLots, setSelectedProductLots] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const wrapperRef = useRef(null);

    const suggestAbortRef = useRef(null);
    const searchAbortRef = useRef(null);

    const normStr = useCallback(v => String(v ?? '').trim(), []);
    const onlyDigits = useCallback(v => (String(v ?? '').match(/\d+/g) || []).join(''), []);
    const lower = useCallback(v => normStr(v).toLowerCase(), [normStr]);

    const getAny = (obj, keys) => {
        for (const k of keys) {
            if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return undefined;
    };

    const productKeys = useCallback((p) => {
        const full = normStr(getAny(p, ['codprodu', 'CODPRODU', 'codigo', 'code', 'referencia']));
        const num = onlyDigits(full);
        const codartic = normStr(getAny(p, ['codartic', 'CODARTIC']));
        const ref = normStr(getAny(p, ['referencia', 'REFERENCIA']));
        const marca = normStr(getAny(p, ['codmarca', 'CODMARCA', 'marca', 'MARCA']));
        return { full, num, codartic, ref, marca };
    }, [normStr, onlyDigits]);

    const normalizeLots = useCallback((arr = []) => {
        return arr
            .map(l => {
                const codloteVal = getAny(l, ['codlote', 'CODLOTE', 'lote', 'LOTE', 'codigo_lote', 'codigo', 'code', 'CODIGO']);
                const qtyRaw = getAny(l, ['stockactual', 'STOCKACTUAL', 'stock_actual', 'cantidad', 'CANTIDAD', 'qty', 'quantity']);
                const cantidad = Number.parseFloat(qtyRaw || 0);
                return {
                    codlote: String(codloteVal ?? ''),
                    stockactual: Number.isFinite(cantidad) ? cantidad.toFixed(2) : '0.00',
                };
            })
            .filter(x => x.codlote !== '');
    }, []);

    const stockByProd = useMemo(() => {
        const map = new Map();
        for (const s of stocks) {
            const key = normStr(getAny(s, ['codprodu', 'CODPRODU', 'cod_product', 'COD_PRODUCTO', 'codigo', 'code', 'referencia']));
            map.set(key, s);
        }
        return map;
    }, [stocks, normStr]);

    const isValidProduct = useCallback(
        p =>
            ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(p.codmarca) &&
            !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(
                p.desprodu
            ) &&
            !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(p.desprodu),
        []
    );

    const computeCombined = useCallback(
        prods =>
            prods.filter(isValidProduct).map(p => {
                const key = normStr(p.codprodu);
                const s = stockByProd.get(key);
                const total = s ? parseFloat(s.stockactual || 0) : 0;
                return {
                    ...p,
                    stockactual: Number.isFinite(total) ? total.toFixed(2) : '0.00',
                    canpenrecib: s ? parseFloat(s.canpenrecib || 0).toFixed(2) : '0.00',
                    canpenservir: s ? parseFloat(s.canpenservir || 0).toFixed(2) : '0.00'
                };
            }),
        [stockByProd, isValidProduct, normStr]
    );

    const combinedProducts = useMemo(() => computeCombined(products), [products, computeCombined]);

    useEffect(() => {
        if (!isSearchActive) setFilteredProducts(combinedProducts);
    }, [combinedProducts, isSearchActive]);

    useEffect(() => {
        if (isSearchActive && lastSearchResultsRaw.length) {
            setFilteredProducts(computeCombined(lastSearchResultsRaw));
        }
    }, [isSearchActive, lastSearchResultsRaw, computeCombined]);

    const pagedProducts = useMemo(() => {
        if (!isSearchActive) return combinedProducts;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    }, [isSearchActive, filteredProducts, combinedProducts, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        const count = isSearchActive ? filteredProducts.length : totalProducts;
        return Math.max(1, Math.ceil(count / itemsPerPage));
    }, [isSearchActive, filteredProducts.length, totalProducts, itemsPerPage]);

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

    useEffect(() => {
        if (!token) return;
        setLoadingStock(true);
        setError(null);
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error('Error loading stock');
                return res.json();
            })
            .then(sData => setStocks(sData))
            .catch(err => setError(err.message))
            .finally(() => setLoadingStock(false));
    }, [token]);

    const fuzzyFilter = useCallback(
        (p, term) =>
            term
                .toLowerCase()
                .split(' ')
                .filter(Boolean)
                .every(t => p.desprodu.toLowerCase().includes(t)),
        []
    );

    useEffect(() => {
        if (searchTerm.length < 3 || !token) {
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
                .catch(() => { /* ignore */ });
        }, 250);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [searchTerm, token, isValidProduct, fuzzyFilter]);

    const performSearch = useCallback(
        query => {
            const q = (query || '').trim();
            if (!q) return;

            setLoadingSearch(true);
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
                .catch(() => { /* ignore */ })
                .finally(() => setLoadingSearch(false));
        },
        [token, computeCombined, SEARCH_FETCH_LIMIT]
    );

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

    // CLICK EN PRODUCTO: consulta de lotes SOLO almacén 00
    const handleProductClick = async (p) => {
        const { full, num, marca } = productKeys(p);
        const numNoZeros = String(Number(num || 0));
        const mk = (marca || '').trim().toUpperCase();

        setSelectedProduct(p);
        setSelectedProductLots([]);
        setModalVisible(true);

        const almQuery = 'alm=0';

        const candidates = [
            { key: full, label: 'full' },
            { key: num, label: 'numeric' },
            { key: numNoZeros, label: 'numericNoZeros' },
            { key: `${mk}${num}`, label: 'marca+numeric' },
            { key: `${mk}${numNoZeros}`, label: 'marca+numericNZ' }
        ]
            .map(x => ({ ...x, key: (x.key ?? '').toString().trim() }))
            .filter(x => x.key.length > 0);

        const seen = new Set();
        const uniqueCandidates = candidates.filter(c => (seen.has(c.key) ? false : (seen.add(c.key), true)));

        let serverLots = [];

        const tryFetch = async (k) => {
            const url = `${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${encodeURIComponent(k)}?${almQuery}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return [];
            const raw = await res.json();
            const arr = Array.isArray(raw) ? raw
                : Array.isArray(raw?.lotes) ? raw.lotes
                    : Array.isArray(raw?.data) ? raw.data
                        : [];
            return normalizeLots(arr);
        };

        try {
            for (const cand of uniqueCandidates) {
                const lots = await tryFetch(cand.key);
                if (lots.length) { serverLots = lots; break; }
            }
            if (serverLots.length) setSelectedProductLots(serverLots);
        } catch {
            // silencio: no mostramos errores de consola de pruebas
        }
    };

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
                        selectedProduct={selectedProduct}
                        closeModal={() => setModalVisible(false)}
                    />
                )}
            </div>
        </div>
    );
}

export default Stock;
