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
}) {
    const { token } = useAuthContext();
    const wrapperRef = useRef(null);
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

    function fuzzyFilter(client, term) {
        const haystack = normalizeString(`${client.razclien} ${client.codclien}`);
        return normalizeString(term).split(' ').every((part) => haystack.includes(part));
    }

    async function fetchSuggestions(value) {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${encodeURIComponent(value)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) throw new Error();
            const data = await response.json();
            setSuggestions(data.filter((client) => fuzzyFilter(client, value)));
        } catch {
            setSuggestions([]);
        }
    }

    const handleChange = (event) => {
        const value = event.target.value;
        setSearchTerm(value);

        if (normalizeString(value).length > 1) {
            setShowSuggestions(true);
            fetchSuggestions(value);
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }

        setActiveIndex(-1);
    };

    const selectClient = (client) => {
        setSearchTerm(client.razclien);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setSuggestions([]);
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
            if (activeIndex >= 0) selectClient(suggestions[activeIndex]);
            else {
                setShowSuggestions(false);
                handleSearchEnter();
            }
        }
    };

    const clearSearch = () => {
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
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
            <label className="cjm-control-label" htmlFor="client-search-input">
                Buscar cliente
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                    <FiSearch
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]"
                        aria-hidden="true"
                    />
                    <input
                        id="client-search-input"
                        type="search"
                        placeholder="Nombre o código de cliente"
                        value={searchTerm}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-11"
                    />

                    {searchTerm && (
                        <button
                            type="button"
                            onClick={clearSearch}
                            className="cjm-icon-button absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border-0 bg-transparent"
                            aria-label="Limpiar búsqueda"
                        >
                            <FiX aria-hidden="true" />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleSearchEnter}
                    className="cjm-primary-button min-h-12 w-full rounded-xl px-5 py-3 text-sm font-semibold sm:w-auto"
                >
                    <FiSearch aria-hidden="true" />
                    Buscar
                </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <ul
                    className="absolute left-0 right-0 z-50 mt-2 max-h-[min(20rem,48dvh)] overflow-y-auto rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-1.5 shadow-[var(--cjm-shadow)]"
                    role="listbox"
                >
                    {suggestions.map((client, index) => {
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
