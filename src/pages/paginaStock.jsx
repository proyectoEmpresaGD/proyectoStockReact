// src/pages/paginaStock.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import SearchBar from '../components/productos/SearchBar';
import ProductTable from '../components/productos/ProductTable';
import PaginationControls from '../components/PaginationControls';
import { useAuthContext } from '../Auth/AuthContext';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import PageShell from '../common/PageShell.jsx';

function Stock() {
    const { token } = useAuthContext();

    const SEARCH_FETCH_LIMIT = 5000;

    // Solo cargamos stock (para stockactual, plaentre, cantminima, etc.)
    const [stocks, setStocks] = useState([]);
    const [loadingStock, setLoadingStock] = useState(false);

    // Búsqueda / fechas
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingFechas, setLoadingFechas] = useState(false);
    const [error, setError] = useState(null);

    // Resultados
    const [resultsRaw, setResultsRaw] = useState([]);
    const [combinedResults, setCombinedResults] = useState([]);

    // Paginación local
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Input / sugerencias
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    // Fechas estimadas por código
    const [fechasByCode, setFechasByCode] = useState({});
    const requestedFechasRef = useRef(new Set());

    // Refs Abort
    const wrapperRef = useRef(null);
    const suggestAbortRef = useRef(null);
    const searchAbortRef = useRef(null);
    const fechasAbortRef = useRef(null);

    // Helpers
    const normStr = useCallback((v) => String(v ?? '').trim(), []);
    const onlyDigits = useCallback((v) => (String(v ?? '').match(/\d+/g) || []).join(''), []);

    const getAny = (obj, keys) => {
        for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
        return undefined;
    };

    const productKeys = useCallback(
        (p) => {
            const full = normStr(getAny(p, ['codprodu', 'CODPRODU', 'codigo', 'code', 'referencia']));
            const num = onlyDigits(full);
            const marca = normStr(getAny(p, ['codmarca', 'CODMARCA', 'marca', 'MARCA']));
            return { full, num, marca };
        },
        [normStr, onlyDigits]
    );

    const normalizeLots = useCallback((arr = []) => {
        return arr
            .map((l) => {
                const codloteVal = getAny(l, ['codlote', 'CODLOTE', 'lote', 'LOTE', 'codigo_lote', 'codigo', 'code', 'CODIGO']);
                const qtyRaw = getAny(l, ['stockactual', 'STOCKACTUAL', 'stock_actual', 'cantidad', 'CANTIDAD', 'qty', 'quantity']);
                const cantidad = Number.parseFloat(qtyRaw || 0);
                return {
                    codlote: String(codloteVal ?? ''),
                    stockactual: Number.isFinite(cantidad) ? cantidad.toFixed(2) : '0.00',
                };
            })
            .filter((x) => x.codlote !== '');
    }, []);

    const isValidProduct = useCallback(
        (p) =>
            ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(p.codmarca) &&
            !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|CUTTING|QUALITY|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(
                p.desprodu
            ) &&
            !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(p.desprodu),
        []
    );

    // Map de stock por codprodu
    const stockByProd = useMemo(() => {
        const map = new Map();
        for (const s of stocks) {
            const key = normStr(getAny(s, ['codprodu', 'CODPRODU', 'cod_product', 'COD_PRODUCTO', 'codigo', 'code', 'referencia']));
            map.set(key, s);
        }
        return map;
    }, [stocks, normStr]);

    // Combina resultados con stock y fechas
    const computeCombined = useCallback(
        (prods) =>
            prods
                .filter(isValidProduct)
                .map((p) => {
                    const key = normStr(p.codprodu);
                    const s = stockByProd.get(key);
                    const total = s ? parseFloat(s.stockactual || 0) : 0;

                    return {
                        ...p,
                        stockactual: Number.isFinite(total) ? total.toFixed(2) : '0.00',
                        canpenrecib: s ? parseFloat(s.canpenrecib || 0).toFixed(2) : '0.00',
                        canpenservir: s ? parseFloat(s.canpenservir || 0).toFixed(2) : '0.00',
                        fechaestimada: fechasByCode[key] || null,
                        plaentre: s?.plaentre || null,
                        cantminima: s?.cantminima || null,
                    };
                }),
        [stockByProd, isValidProduct, normStr, fechasByCode]
    );

    // ✅ cargar stock una vez
    useEffect(() => {
        if (!token) return;
        setLoadingStock(true);
        setError(null);

        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) throw new Error('Error loading stock');
                return res.json();
            })
            .then((sData) => setStocks(sData))
            .catch((err) => setError(err.message))
            .finally(() => setLoadingStock(false));
    }, [token]);

    // Recalcula combinados cuando cambian resultados/stock/fechas
    useEffect(() => {
        if (!resultsRaw.length) {
            setCombinedResults([]);
            return;
        }
        setCombinedResults(computeCombined(resultsRaw));
    }, [resultsRaw, computeCombined]);

    const totalPages = useMemo(() => {
        const count = combinedResults.length;
        return Math.max(1, Math.ceil(count / itemsPerPage));
    }, [combinedResults.length]);

    const pagedProducts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return combinedResults.slice(start, start + itemsPerPage);
    }, [combinedResults, currentPage]);

    // ✅ fechas solo para visibles
    useEffect(() => {
        if (!token) return;
        if (!resultsRaw.length) return;

        const visibleList = resultsRaw.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        const codesAll = visibleList.map((p) => normStr(p.codprodu)).filter(Boolean);
        const codes = codesAll.filter((c) => !requestedFechasRef.current.has(c));
        if (!codes.length) return;

        for (const c of codes) requestedFechasRef.current.add(c);

        fechasAbortRef.current?.abort?.();
        const controller = new AbortController();
        fechasAbortRef.current = controller;

        setLoadingFechas(true);

        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock/fechas?codes=${encodeURIComponent(codes.join(','))}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Error loading fechas'))))
            .then((data) => setFechasByCode((prev) => ({ ...prev, ...data })))
            .catch((err) => {
                if (err?.name === 'AbortError') return;
                for (const c of codes) requestedFechasRef.current.delete(c);
            })
            .finally(() => setLoadingFechas(false));

        return () => controller.abort();
    }, [token, resultsRaw, currentPage, itemsPerPage, normStr]);

    const fuzzyFilter = useCallback(
        (p, term) =>
            term
                .toLowerCase()
                .split(' ')
                .filter(Boolean)
                .every((t) => p.desprodu.toLowerCase().includes(t)),
        []
    );

    // Sugerencias
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
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(searchTerm)}&limit=200`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
                .then((res) => {
                    if (!res.ok) throw new Error();
                    return res.json();
                })
                .then((data) => setSuggestions(data.filter(isValidProduct).filter((p) => fuzzyFilter(p, searchTerm))))
                .catch(() => { });
        }, 250);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [searchTerm, token, isValidProduct, fuzzyFilter]);

    // ✅ búsqueda principal
    const performSearch = useCallback(
        (query) => {
            const q = (query || '').trim();
            if (!q) return;

            setLoadingSearch(true);
            setError(null);

            // reset fechas para la nueva búsqueda
            requestedFechasRef.current = new Set();
            setFechasByCode({});

            searchAbortRef.current?.abort?.();
            const controller = new AbortController();
            searchAbortRef.current = controller;

            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(q)}&limit=${SEARCH_FETCH_LIMIT}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
                .then((res) => {
                    if (!res.ok) throw new Error('Error search');
                    return res.json();
                })
                .then((data) => {
                    setResultsRaw(Array.isArray(data) ? data : []);
                    setCurrentPage(1);

                    // ✅ subir arriba tras cada búsqueda
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                })
                .catch((err) => {
                    if (err?.name === 'AbortError') return;
                    setError('No se ha podido realizar la búsqueda.');
                })
                .finally(() => setLoadingSearch(false));
        },
        [token, SEARCH_FETCH_LIMIT]
    );

    const handleSearchKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            performSearch(searchTerm);
            setSuggestions([]);
            setSearchTerm('');
        }
    };

    const handleSuggestionClickLocal = (p) => {
        performSearch(p.desprodu);
        setSuggestions([]);
        setSearchTerm('');
    };

    const handlePageChange = (pageNum) => {
        const p = Math.max(1, Math.min(pageNum, totalPages));
        setCurrentPage(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ✅ lotes: misma lógica precisa que el modal
    const fetchProductLots = useCallback(
        async (p) => {
            if (!token || !p) return [];

            const { full, num, marca } = productKeys(p);
            const numNoZeros = String(Number(num || 0));
            const mk = (marca || '').trim().toUpperCase();

            const almQuery = 'alm=0';

            const candidates = [full, num, numNoZeros, `${mk}${num}`, `${mk}${numNoZeros}`]
                .map((x) => (x ?? '').toString().trim())
                .filter((x) => x.length > 0);

            const seen = new Set();
            const uniqueCandidates = candidates.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));

            const tryFetch = async (k) => {
                const url = `${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${encodeURIComponent(k)}?${almQuery}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return [];
                const raw = await res.json();
                const arr = Array.isArray(raw)
                    ? raw
                    : Array.isArray(raw?.lotes)
                        ? raw.lotes
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : [];
                return normalizeLots(arr);
            };

            for (const k of uniqueCandidates) {
                const lots = await tryFetch(k);
                if (lots.length) return lots;
            }
            return [];
        },
        [token, productKeys, normalizeLots]
    );

    // Captura Enter del input real
    useEffect(() => {
        const root = wrapperRef.current;
        if (!root) return;

        const input = root.querySelector('input');
        if (!input) return;

        input.setAttribute('autocomplete', 'off');

        const onKeyDown = (e) => {
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

    const anyLoading = loadingStock;

    return (
        <PageShell maxWidth="max-w-5xl" className="mt-16 sm:mt-20">
            <h1 className="mb-4 text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Stock</h1>
            <p className="mb-6 text-center text-sm text-slate-500 md:text-base">Herramienta de búsqueda de productos y lotes.</p>

            <div ref={wrapperRef} className="mb-6">
                <SearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    suggestions={suggestions}
                    setSuggestions={setSuggestions}
                    handleSearchInputChange={(e) => setSearchTerm(e.target.value)}
                    handleSearchKeyPress={handleSearchKeyPress}
                    handleSuggestionClick={handleSuggestionClickLocal}
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {loadingSearch && (
                        <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                            <AiOutlineLoading3Quarters className="animate-spin" />
                            Buscando…
                        </span>
                    )}

                    {loadingFechas && (
                        <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                            <AiOutlineLoading3Quarters className="animate-spin" />
                            Cargando fechas…
                        </span>
                    )}

                    {!!combinedResults.length && (
                        <span className="ml-auto text-sm text-slate-600">
                            {combinedResults.length} resultado{combinedResults.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
            </div>

            {error && <p className="mb-4 text-center text-red-500">{error}</p>}

            {anyLoading ? (
                <div className="flex justify-center py-10">
                    <AiOutlineLoading3Quarters className="text-3xl text-slate-600 animate-spin" />
                </div>
            ) : (
                <>
                    <ProductTable products={pagedProducts} fetchProductLots={fetchProductLots} />

                    {!!combinedResults.length && (
                        <PaginationControls currentPage={currentPage} totalPages={totalPages} handlePageChange={handlePageChange} />
                    )}
                </>
            )}
        </PageShell>
    );
}

export default Stock;
