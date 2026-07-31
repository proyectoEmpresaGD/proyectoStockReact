import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiOutlineSearch } from 'react-icons/ai';
import { FiBox } from 'react-icons/fi';
import debounce from 'lodash.debounce';

const SearchBar = ({
    searchTerm,
    setSearchTerm,
    suggestions,
    setSuggestions,
    handleSearchKeyPress,
    handleSuggestionClick,
    handleSearchInputChange,
}) => {
    const [localTerm, setLocalTerm] = useState(searchTerm || '');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const wrapperRef = useRef(null);
    const suggestionsRefs = useRef([]);
    const lastEmittedRef = useRef(searchTerm || '');

    const debouncedUpdate = useMemo(() => debounce((value) => {
        lastEmittedRef.current = value;
        handleSearchInputChange?.({ target: { value } });
    }, 300), [handleSearchInputChange]);

    useEffect(() => () => debouncedUpdate.cancel(), [debouncedUpdate]);

    useEffect(() => {
        const incoming = searchTerm ?? '';
        if (incoming !== lastEmittedRef.current) {
            setLocalTerm(incoming.toUpperCase());
            setHighlightedIndex(0);
        }
    }, [searchTerm]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setSuggestions([]);
                setHighlightedIndex(0);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setSuggestions]);

    useEffect(() => {
        const element = suggestionsRefs.current[highlightedIndex];
        if (element) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [highlightedIndex, suggestions]);

    useEffect(() => setHighlightedIndex(0), [suggestions, localTerm]);

    const onInputChange = (event) => {
        const value = (event.target.value || '').toUpperCase();
        setLocalTerm(value);
        debouncedUpdate(value);
    };

    const doSearchNow = (event) => {
        const value = (localTerm || '').trim();
        if (!value) return;

        lastEmittedRef.current = value;
        setSearchTerm?.(value);
        handleSearchInputChange?.({ target: { value } });
        handleSearchKeyPress?.(event, value);
        setSuggestions([]);
    };

    const onKeyDown = (event) => {
        if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1));
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(index - 1, 0));
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                const selected = suggestions[highlightedIndex];
                if (selected) {
                    handleSuggestionClick(selected);
                    setSuggestions([]);
                } else {
                    doSearchNow(event);
                }
                return;
            }
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            doSearchNow(event);
        }
    };

    return (
        <div
            ref={wrapperRef}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-owns="product-search-listbox"
            className="relative w-full"
        >
            <label className="cjm-control-label" htmlFor="product-stock-search">
                Producto o referencia
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                    <FiBox
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]"
                        aria-hidden="true"
                    />
                    <input
                        id="product-stock-search"
                        type="search"
                        value={localTerm}
                        onChange={onInputChange}
                        onKeyDown={onKeyDown}
                        autoComplete="off"
                        enterKeyHint="search"
                        aria-autocomplete="list"
                        aria-controls="product-search-listbox"
                        aria-activedescendant={suggestions.length > 0 ? `product-search-option-${highlightedIndex}` : undefined}
                        className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-4 uppercase"
                        placeholder="Ej. OM, DAMASCO o una referencia"
                    />
                </div>

                <button
                    type="button"
                    onClick={() => doSearchNow({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} })}
                    disabled={!localTerm.trim()}
                    className="cjm-primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold sm:w-auto"
                >
                    <AiOutlineSearch className="text-lg" aria-hidden="true" />
                    Buscar
                </button>
            </div>

            <p className="cjm-muted mt-2 text-xs leading-5">
                Pulsa Enter o selecciona una coincidencia. En móvil puedes usar el botón Buscar.
            </p>

            {suggestions.length > 0 && (
                <ul
                    id="product-search-listbox"
                    role="listbox"
                    className="absolute left-0 right-0 z-50 mt-2 max-h-[min(20rem,48dvh)] overflow-auto rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-1.5 shadow-[var(--cjm-shadow)]"
                >
                    {suggestions.map((suggestion, index) => {
                        const highlighted = highlightedIndex === index;
                        return (
                            <li
                                key={suggestion.codprodu ?? index}
                                ref={(element) => (suggestionsRefs.current[index] = element)}
                                id={`product-search-option-${index}`}
                                role="option"
                                aria-selected={highlighted}
                                className={`cursor-pointer rounded-xl px-3 py-3 transition ${
                                    highlighted
                                        ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]'
                                        : 'text-[var(--cjm-text)] hover:bg-[var(--cjm-surface-muted)]'
                                }`}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                onClick={() => {
                                    handleSuggestionClick(suggestion);
                                    setSuggestions([]);
                                }}
                            >
                                <span className="block text-sm font-semibold leading-5">
                                    {suggestion.desprodu}
                                </span>
                                {suggestion.codprodu && (
                                    <span className="cjm-muted mt-0.5 block text-xs">
                                        Ref. {suggestion.codprodu}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default SearchBar;
