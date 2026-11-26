import TranslatedText from '../../i18n/TranslatedText.jsx';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import { useAuthContext } from '../../Auth/AuthContext';

function normalizeString(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

export default function SearchBar({
    searchTerm,
    setSearchTerm,
    suggestions,
    setSuggestions,
    handleSuggestionClick,
    handleSearchEnter,
    searchScope = 'clientes',
    portfolioView = 'equipo',
    // Los informes reutilizan exactamente el buscador de Clientes, pero tienen
    // su propia ruta de consulta, protegida por permisos contables.
    loadSuggestions,
    inputId = 'client-search-input',
    label = 'Buscar cliente',
    placeholder = 'Nombre o código de cliente',
    showSearchButton = true,
    debounceMs = 0,
    minSearchChars = 2,
    showOnFocus = false,
    selectFirstOnEnter = false,
}) {
    const { token } = useAuthContext();
    const wrapperRef = useRef(null);
    const suggestionAbortRef = useRef(null);
    const suggestionTimerRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [searchCompleted, setSearchCompleted] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
                setActiveIndex(-1);
            }
        }

        function handleKey(event) {
            if (event.key === 'Escape') {
                setShowSuggestions(false);
                setActiveIndex(-1);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, []);

    useEffect(() => () => {
        suggestionAbortRef.current?.abort();
        clearTimeout(suggestionTimerRef.current);
    }, []);

    // Evita conservar sugerencias de la cartera anterior tras cambiar el filtro.
    useEffect(() => {
        suggestionAbortRef.current?.abort();
        clearTimeout(suggestionTimerRef.current);
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
    }, [portfolioView, setSuggestions]);

    function fuzzyFilter(client, term) {
        const haystack = normalizeString(`${client.razclien} ${client.codclien}`);
        const searched = normalizeString(term);
        return searched.split(' ').every((part) => haystack.includes(part))
            || haystack.replaceAll(' ', '').includes(searched.replaceAll(' ', ''));
    }

    async function fetchSuggestions(value) {
        suggestionAbortRef.current?.abort();
        const controller = new AbortController();
        suggestionAbortRef.current = controller;
        setLoading(true);
        setSearchError(false);
        setSearchCompleted(false);

        // Reservas consulta todos los clientes activos sin abrir permisos de
        // cartera en /api/clients. En Clientes se conserva el endpoint anterior.
        const isReserva = searchScope === 'reservas';
        const path = isReserva ? '/api/reservas/clientes/search' : '/api/clients/search';
        const params = new URLSearchParams({ query: value });
        if (isReserva) params.set('limit', '50');
        else if (portfolioView === 'propia') params.set('cartera', 'propia');

        try {
            let data;
            if (typeof loadSuggestions === 'function') {
                // Resultados con el mismo formato que /api/clients/search:
                // { codclien, razclien }. La carga se cancela al seguir escribiendo.
                data = await loadSuggestions(value, { signal: controller.signal });
            } else {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}${path}?${params.toString()}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        signal: controller.signal,
                    }
                );
                if (!response.ok) throw new Error(`Error de búsqueda: ${response.status}`);
                data = await response.json();
            }
            if (!controller.signal.aborted) {
                setSuggestions(Array.isArray(data) ? data.filter((item) => fuzzyFilter(item, value)) : []);
                setSearchCompleted(true);
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                console.error('No se han podido cargar las sugerencias:', error);
                setSuggestions([]);
                setSearchError(true);
            }
        } finally {
            if (!controller.signal.aborted) setLoading(false);
            if (suggestionAbortRef.current === controller) suggestionAbortRef.current = null;
        }
    }

    const handleChange = (event) => {
        const value = event.target.value;
        setSearchTerm(value);

        suggestionAbortRef.current?.abort();
        clearTimeout(suggestionTimerRef.current);
        setSearchError(false);
        setSearchCompleted(false);
        if (normalizeString(value).length >= minSearchChars) {
            setShowSuggestions(true);
            setSuggestions([]);
            suggestionTimerRef.current = setTimeout(() => fetchSuggestions(value), Math.max(0, debounceMs));
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
            setLoading(false);
        }

        setActiveIndex(-1);
    };

    const selectClient = (client) => {
        suggestionAbortRef.current?.abort();
        clearTimeout(suggestionTimerRef.current);
        setSearchTerm(client.razclien);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setSuggestions([]);
        setLoading(false);
        handleSuggestionClick(client);
        handleSearchEnter();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !showSuggestions) {
            event.preventDefault();
            handleSearchEnter();
            return;
        }

        if (!showSuggestions) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (activeIndex >= 0 && suggestions[activeIndex]) selectClient(suggestions[activeIndex]);
            else if (selectFirstOnEnter && suggestions.length > 0) selectClient(suggestions[0]);
            else {
                setShowSuggestions(false);
                handleSearchEnter();
            }
        }
    };

    const clearSearch = () => {
        suggestionAbortRef.current?.abort();
        clearTimeout(suggestionTimerRef.current);
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setLoading(false);
        setSearchError(false);
        setSearchCompleted(false);
        handleSearchEnter();
    };

    return (
        <div
            ref={wrapperRef}
            className="relative w-full"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={showSuggestions}
        >
            <label className="cjm-control-label" htmlFor={inputId}>
                {label === 'Buscar cliente' ? <TranslatedText>Buscar cliente</TranslatedText> : label}
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                    <FiSearch
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]"
                        aria-hidden="true"
                    />
                    <LocalizedElement><input
                        id={inputId}
                        type="search"
                        placeholder={placeholder}
                        value={searchTerm}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            if (!showOnFocus) return;
                            suggestionAbortRef.current?.abort();
                            clearTimeout(suggestionTimerRef.current);
                            setShowSuggestions(true);
                            fetchSuggestions(searchTerm);
                        }}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-11"
                    /></LocalizedElement>

                    {searchTerm && (
                        <LocalizedElement><button
                            type="button"
                            onClick={clearSearch}
                            className="cjm-icon-button absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border-0 bg-transparent"
                            aria-label="Limpiar búsqueda"
                        >
                            <FiX aria-hidden="true" />
                        </button></LocalizedElement>
                    )}
                </div>

                {showSearchButton && (
                    <button
                        type="button"
                        onClick={handleSearchEnter}
                        className="cjm-primary-button min-h-12 w-full rounded-xl px-5 py-3 text-sm font-semibold sm:w-auto"
                    >
                        <FiSearch aria-hidden="true" />
                        Buscar
                    </button>
                )}
            </div>

            {showSuggestions && (suggestions.length > 0 || loading || searchError || searchCompleted) && (
                <ul
                    className="absolute left-0 right-0 z-50 mt-2 max-h-[min(20rem,48dvh)] overflow-y-auto rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-1.5 shadow-[var(--cjm-shadow)]"
                    role="listbox"
                >
                    {loading && <li className="px-3 py-2 text-sm text-[var(--cjm-muted)]">Buscando coincidencias…</li>}
                    {!loading && searchError && <li role="alert" className="px-3 py-2 text-sm text-rose-700">No se ha podido buscar. Prueba de nuevo.</li>}
                    {!loading && !searchError && searchCompleted && suggestions.length === 0 && <li className="px-3 py-2 text-sm text-[var(--cjm-muted)]">Sin coincidencias. Prueba con otro nombre o código.</li>}
                    {!loading && suggestions.map((client, index) => {
                        const active = index === activeIndex;
                        return (
                            <li
                                key={`${client.codclien}-${index}`}
                                role="option"
                                aria-selected={active}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3 transition ${
                                    active
                                        ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]'
                                        : 'text-[var(--cjm-text)] hover:bg-[var(--cjm-surface-muted)]'
                                }`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => selectClient(client)}
                            >
                                <span className="min-w-0 truncate text-sm font-semibold">
                                    {client.razclien}
                                </span>
                                <span className="cjm-badge shrink-0">{client.codclien}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
