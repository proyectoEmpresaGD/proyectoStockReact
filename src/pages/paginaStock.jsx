// src/pages/paginaStock.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import SearchBar from '../components/productos/SearchBar';
import ProductTable from '../components/productos/ProductTable';
import PaginationControls from '../components/PaginationControls';
import { useAuthContext } from '../Auth/AuthContext';
import { AiOutlineLoading3Quarters, AiOutlineSearch } from 'react-icons/ai';
import { FaTimes } from 'react-icons/fa';
import { FiHelpCircle, FiPackage } from 'react-icons/fi';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';

function Stock() {
    const { token } = useAuthContext();

    const SEARCH_FETCH_LIMIT = 5000;

    const [stocks, setStocks] = useState([]);
    const [loadingStock, setLoadingStock] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingFechas, setLoadingFechas] = useState(false);
    const [error, setError] = useState(null);
    const [resultsRaw, setResultsRaw] = useState([]);
    const [combinedResults, setCombinedResults] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [fechasByCode, setFechasByCode] = useState({});
    const [showHelpModal, setShowHelpModal] = useState(false);

    const itemsPerPage = 10;
    const requestedFechasRef = useRef(new Set());
    const wrapperRef = useRef(null);
    const suggestAbortRef = useRef(null);
    const searchAbortRef = useRef(null);
    const fechasAbortRef = useRef(null);

    const normStr = useCallback((value) => String(value ?? '').trim(), []);
    const onlyDigits = useCallback((value) => (String(value ?? '').match(/\d+/g) || []).join(''), []);

    const getAny = (obj, keys) => {
        for (const key of keys) {
            if (obj && obj[key] !== undefined && obj[key] !== null) {
                return obj[key];
            }
        }

        return undefined;
    };

    const productKeys = useCallback(
        (product) => {
            const full = normStr(getAny(product, ['codprodu', 'CODPRODU', 'codigo', 'code', 'referencia']));
            const num = onlyDigits(full);
            const marca = normStr(getAny(product, ['codmarca', 'CODMARCA', 'marca', 'MARCA']));

            return { full, num, marca };
        },
        [normStr, onlyDigits]
    );

    const normalizeLots = useCallback((arr = []) => {
        return arr
            .map((lote) => {
                const codloteVal = getAny(lote, [
                    'codlote',
                    'CODLOTE',
                    'lote',
                    'LOTE',
                    'codigo_lote',
                    'codigo',
                    'code',
                    'CODIGO',
                ]);

                const stockDisponibleRaw = getAny(lote, [
                    'stockactual',
                    'STOCKACTUAL',
                    'stockdisponible',
                    'STOCKDISPONIBLE',
                    'stock_disponible',
                    'stock_actual',
                    'cantidad',
                    'CANTIDAD',
                    'qty',
                    'quantity',
                ]);

                const stockTotalRaw = getAny(lote, ['stocktotal', 'STOCKTOTAL', 'stock_total']);
                const stockReservadoRaw = getAny(lote, ['stockreservado', 'STOCKRESERVADO', 'stock_reservado']);

                const stockDisponible = Number.parseFloat(stockDisponibleRaw || 0);
                const stockReservado = Number.parseFloat(stockReservadoRaw || 0);

                const stockTotal = Number.parseFloat(
                    stockTotalRaw ?? Number(stockDisponible || 0) + Number(stockReservado || 0)
                );

                return {
                    codlote: String(codloteVal ?? ''),
                    stockactual: Number.isFinite(stockDisponible) ? stockDisponible.toFixed(2) : '0.00',
                    stocktotal: Number.isFinite(stockTotal) ? stockTotal.toFixed(2) : '0.00',
                    stockreservado: Number.isFinite(stockReservado) ? stockReservado.toFixed(2) : '0.00',
                };
            })
            .filter((lote) => lote.codlote !== '');
    }, []);

    const isValidProduct = useCallback(
        (product) =>
            ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(product.codmarca) &&
            !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|CUTTING|QUALITY|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(
                product.desprodu
            ) &&
            !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(product.desprodu),
        []
    );

    const stockByProd = useMemo(() => {
        const map = new Map();

        for (const stock of stocks) {
            const key = normStr(
                getAny(stock, [
                    'codprodu',
                    'CODPRODU',
                    'cod_product',
                    'COD_PRODUCTO',
                    'codigo',
                    'code',
                    'referencia',
                ])
            ).toUpperCase();

            if (key) {
                map.set(key, stock);
            }
        }

        return map;
    }, [stocks, normStr]);

    const computeCombined = useCallback(
        (productsList) =>
            productsList
                .filter(isValidProduct)
                .map((product) => {
                    const key = normStr(product.codprodu).toUpperCase();
                    const stock = stockByProd.get(key);

                    const stockDisponible = stock ? parseFloat(stock.stockactual || 0) : 0;
                    const stockReservado = stock ? parseFloat(stock.stockreservado || 0) : 0;

                    const stockTotal = stock
                        ? parseFloat(
                            stock.stocktotal ??
                            stock.STOCKTOTAL ??
                            Number(stockDisponible || 0) + Number(stockReservado || 0)
                        )
                        : 0;

                    return {
                        ...product,
                        stockactual: Number.isFinite(stockDisponible) ? stockDisponible.toFixed(2) : '0.00',
                        stocktotal: Number.isFinite(stockTotal) ? stockTotal.toFixed(2) : '0.00',
                        stockreservado: Number.isFinite(stockReservado) ? stockReservado.toFixed(2) : '0.00',
                        canpenrecib: stock ? parseFloat(stock.canpenrecib || 0).toFixed(2) : '0.00',
                        canpenservir: stock ? parseFloat(stock.canpenservir || 0).toFixed(2) : '0.00',
                        fechaestimada: fechasByCode[key] || null,
                        plaentre: stock?.plaentre || null,
                        cantminima: stock?.cantminima || null,
                    };
                }),
        [stockByProd, isValidProduct, normStr, fechasByCode]
    );

    useEffect(() => {
        if (!token) return;

        setLoadingStock(true);
        setError(null);

        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Error loading stock');
                }

                return response.json();
            })
            .then((stockData) => {
                setStocks(Array.isArray(stockData) ? stockData : []);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoadingStock(false));
    }, [token]);

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

    useEffect(() => {
        if (!token) return;
        if (!resultsRaw.length) return;

        const visibleList = resultsRaw.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        const codesAll = visibleList.map((product) => normStr(product.codprodu)).filter(Boolean);
        const codes = codesAll.filter((code) => !requestedFechasRef.current.has(code));

        if (!codes.length) return;

        for (const code of codes) {
            requestedFechasRef.current.add(code);
        }

        fechasAbortRef.current?.abort?.();

        const controller = new AbortController();
        fechasAbortRef.current = controller;

        setLoadingFechas(true);

        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock/fechas?codes=${encodeURIComponent(codes.join(','))}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
        })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Error loading fechas'))))
            .then((data) => setFechasByCode((prev) => ({ ...prev, ...data })))
            .catch((err) => {
                if (err?.name === 'AbortError') return;

                for (const code of codes) {
                    requestedFechasRef.current.delete(code);
                }
            })
            .finally(() => setLoadingFechas(false));

        return () => controller.abort();
    }, [token, resultsRaw, currentPage, itemsPerPage, normStr]);

    const fuzzyFilter = useCallback(
        (product, term) =>
            term
                .toLowerCase()
                .split(' ')
                .filter(Boolean)
                .every((piece) => product.desprodu.toLowerCase().includes(piece)),
        []
    );

    useEffect(() => {
        const normalizedSearchTerm = searchTerm.trim();

        if (normalizedSearchTerm.length < 2 || !token) {
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
                    normalizedSearchTerm
                )}&limit=200`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                }
            )
                .then((response) => {
                    if (!response.ok) {
                        throw new Error();
                    }

                    return response.json();
                })
                .then((data) => {
                    const validSuggestions = Array.isArray(data)
                        ? data
                            .filter(isValidProduct)
                            .filter((product) =>
                                fuzzyFilter(product, normalizedSearchTerm)
                            )
                        : [];

                    setSuggestions(validSuggestions);
                })
                .catch(() => { });
        }, 250);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [searchTerm, token, isValidProduct, fuzzyFilter]);

    const performSearch = useCallback(
        (query) => {
            const cleanQuery = String(query || '').trim();

            if (!cleanQuery) return;

            setLoadingSearch(true);
            setError(null);

            requestedFechasRef.current = new Set();
            setFechasByCode({});

            searchAbortRef.current?.abort?.();

            const controller = new AbortController();
            searchAbortRef.current = controller;

            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                    cleanQuery
                )}&limit=${SEARCH_FETCH_LIMIT}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                }
            )
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Error search');
                    }

                    return response.json();
                })
                .then((data) => {
                    setResultsRaw(Array.isArray(data) ? data : []);
                    setCurrentPage(1);
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

    const handleSearchKeyPress = (event, explicitValue) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        event.stopPropagation();

        performSearch(explicitValue || searchTerm);
        setSuggestions([]);
        setSearchTerm('');
    };

    const handleSuggestionClickLocal = (product) => {
        performSearch(product.desprodu);
        setSuggestions([]);
        setSearchTerm('');
    };

    const handlePageChange = (pageNum) => {
        const page = Math.max(1, Math.min(pageNum, totalPages));

        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const fetchProductLots = useCallback(
        async (product) => {
            if (!token || !product) return [];

            const { full, num, marca } = productKeys(product);
            const numNoZeros = String(Number(num || 0));
            const marcaClean = String(marca || '').trim().toUpperCase();
            const almQuery = 'alm=0';

            const candidates = [full, num, numNoZeros, `${marcaClean}${num}`, `${marcaClean}${numNoZeros}`]
                .map((value) => String(value ?? '').trim())
                .filter((value) => value.length > 0);

            const seen = new Set();

            const uniqueCandidates = candidates.filter((candidate) => {
                if (seen.has(candidate)) return false;
                seen.add(candidate);
                return true;
            });

            const tryFetch = async (candidate) => {
                const url = `${import.meta.env.VITE_API_BASE_URL}/api/stocklotes/stocklotes/${encodeURIComponent(
                    candidate
                )}?${almQuery}`;

                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) return [];

                const raw = await response.json();

                const arr = Array.isArray(raw)
                    ? raw
                    : Array.isArray(raw?.lotes)
                        ? raw.lotes
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : [];

                return normalizeLots(arr);
            };

            for (const candidate of uniqueCandidates) {
                const lots = await tryFetch(candidate);

                if (lots.length) {
                    return lots;
                }
            }

            return [];
        },
        [token, productKeys, normalizeLots]
    );

    useEffect(() => {
        const root = wrapperRef.current;

        if (!root) return;

        const input = root.querySelector('input');

        if (!input) return;

        input.setAttribute('autocomplete', 'off');

        const onKeyDown = (event) => {
            if (event.key !== 'Enter') return;

            event.preventDefault();
            event.stopPropagation();

            const value = input.value ?? '';

            if (value.trim().length > 0) {
                performSearch(value.trim());
                setSuggestions([]);
                setSearchTerm('');
            }
        };

        input.addEventListener('keydown', onKeyDown);

        return () => input.removeEventListener('keydown', onKeyDown);
    }, [performSearch]);

    const anyLoading = loadingStock;

    return (
        <PageShell maxWidth="max-w-6xl" className="mt-16 sm:mt-20">
            <PageHeader
                eyebrow="Operaciones · Almacén"
                title="Consulta de stock"
                description="Busca productos, comprueba el disponible real, las reservas, los lotes y las fechas estimadas desde cualquier dispositivo."
                icon={FiPackage}
                actions={(
                    <button
                        type="button"
                        onClick={() => setShowHelpModal(true)}
                        className="cjm-ghost-button w-full sm:w-auto"
                    >
                        <FiHelpCircle className="text-lg" aria-hidden="true" />
                        Cómo funciona
                    </button>
                )}
            />

            <section className="cjm-toolbar mt-5 sm:mt-6" aria-label="Buscador de stock">
                <div ref={wrapperRef}>
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSearchInputChange={(event) => setSearchTerm(event.target.value)}
                        handleSearchKeyPress={handleSearchKeyPress}
                        handleSuggestionClick={handleSuggestionClickLocal}
                    />

                    <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2">
                        {loadingSearch && (
                            <span className="cjm-brand-chip px-3 py-1.5 text-xs font-semibold">
                                <AiOutlineLoading3Quarters className="animate-spin" aria-hidden="true" />
                                Buscando productos…
                            </span>
                        )}

                        {loadingFechas && (
                            <span className="cjm-brand-chip px-3 py-1.5 text-xs font-semibold">
                                <AiOutlineLoading3Quarters className="animate-spin" aria-hidden="true" />
                                Actualizando fechas…
                            </span>
                        )}

                        {!!combinedResults.length && (
                            <span className="cjm-badge sm:ml-auto">
                                {combinedResults.length} resultado{combinedResults.length === 1 ? '' : 's'}
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {error && (
                <div className="cjm-alert cjm-alert-error mt-4" role="alert">
                    {error}
                </div>
            )}

            <section className="mt-5 sm:mt-6" aria-live="polite">
                {anyLoading ? (
                    <div className="cjm-empty-state flex min-h-44 items-center justify-center">
                        <span className="inline-flex items-center gap-3 text-sm font-semibold app-text">
                            <AiOutlineLoading3Quarters className="animate-spin text-2xl text-[var(--cjm-primary-deep)]" />
                            Preparando el stock…
                        </span>
                    </div>
                ) : (
                    <>
                        <ProductTable products={pagedProducts} fetchProductLots={fetchProductLots} />

                        {!!combinedResults.length && (
                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={totalPages}
                                handlePageChange={handlePageChange}
                            />
                        )}
                    </>
                )}
            </section>

            {showHelpModal && (
                <div className="cjm-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setShowHelpModal(false);
                }}>
                    <section
                        className="cjm-modal sm:max-w-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stock-help-title"
                    >
                        <div className="cjm-modal-header flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
                            <div className="min-w-0">
                                <p className="cjm-kicker">Guía rápida</p>
                                <h2 id="stock-help-title" className="mt-1 text-lg font-semibold app-text sm:text-xl">
                                    Cómo interpretar el stock
                                </h2>
                                <p className="cjm-muted mt-1 text-sm">
                                    Referencia rápida para búsquedas, reservas y lotes.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowHelpModal(false)}
                                className="cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                                aria-label="Cerrar ayuda"
                            >
                                <FaTimes aria-hidden="true" />
                            </button>
                        </div>

                        <div className="cjm-modal-body space-y-3 px-4 py-5 sm:px-6">
                            {[
                                ['Buscador', 'Busca por referencia, código o nombre. Pulsa Enter, toca Buscar o selecciona una sugerencia.'],
                                ['Stock disponible', 'Es la cantidad que puede utilizarse después de descontar las reservas activas.'],
                                ['Lotes', 'El detalle muestra el disponible, reservado y total real de cada lote o pieza.'],
                                ['Fecha estimada', 'La previsión se expresa en días laborables y añade el margen operativo configurado.'],
                            ].map(([title, text]) => (
                                <div key={title} className="cjm-data-card">
                                    <h3 className="text-sm font-semibold app-text">{title}</h3>
                                    <p className="cjm-muted mt-1 text-sm leading-6">{text}</p>
                                </div>
                            ))}
                        </div>

                        <div className="cjm-modal-footer flex justify-end border-t px-4 py-4 sm:px-6">
                            <button
                                type="button"
                                onClick={() => setShowHelpModal(false)}
                                className="cjm-primary-button min-h-11 w-full rounded-xl px-5 py-2.5 text-sm font-semibold sm:w-auto"
                            >
                                Entendido
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </PageShell>
    );
}

export default Stock;