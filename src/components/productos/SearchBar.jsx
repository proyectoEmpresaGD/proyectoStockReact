// src/components/productos/SearchBar.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AiOutlineSearch } from 'react-icons/ai';
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

    const debouncedUpdate = useMemo(() => {
        const fn = debounce((value) => {
            lastEmittedRef.current = value;
            handleSearchInputChange?.({ target: { value } });
            // setSearchTerm?.(value);
        }, 300);
        return fn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleSearchInputChange]);

    useEffect(() => {
        return () => debouncedUpdate.cancel();
    }, [debouncedUpdate]);

    useEffect(() => {
        const incoming = searchTerm ?? '';
        if (incoming !== lastEmittedRef.current) {
            setLocalTerm(incoming.toUpperCase());
            setHighlightedIndex(0);
        }
    }, [searchTerm]);

    const onInputChange = (e) => {
        const value = (e.target.value || '').toUpperCase();
        setLocalTerm(value);
        debouncedUpdate(value);
    };

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

    const doSearchNow = (e) => {
        const value = (localTerm || '').trim();
        handleSearchKeyPress?.(e, value);
        setSuggestions([]);
    };

    const onKeyDown = (e) => {
        if (suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = suggestions[highlightedIndex];
                if (selected) {
                    handleSuggestionClick(selected);
                    setSuggestions([]);
                } else {
                    doSearchNow(e);
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            doSearchNow(e);
        }
    };

    useEffect(() => {
        const el = suggestionsRefs.current[highlightedIndex];
        if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [highlightedIndex, suggestions]);

    const onIconClick = () => {
        doSearchNow({ key: 'Enter', preventDefault: () => { }, stopPropagation: () => { } });
    };

    useEffect(() => {
        setHighlightedIndex(0);
    }, [suggestions, localTerm]);

    return (
        <div
            ref={wrapperRef}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-owns="search-listbox"
            className="relative w-full max-w-lg mx-auto"
        >
            <div className="relative">
                <input
                    type="text"
                    value={localTerm}
                    onChange={onInputChange}
                    onKeyDown={onKeyDown}
                    aria-autocomplete="list"
                    aria-controls="search-listbox"
                    aria-activedescendant={suggestions.length > 0 ? `search-option-${highlightedIndex}` : undefined}
                    className="w-full p-3 pr-12 border rounded-xl uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition duration-200 text-base"
                    placeholder="Buscar productos..."
                />
                <AiOutlineSearch
                    onClick={onIconClick}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500"
                    size={22}
                    aria-label="Buscar"
                />
            </div>

            {suggestions.length > 0 && (
                <ul
                    id="search-listbox"
                    role="listbox"
                    className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-auto"
                >
                    {suggestions.map((s, i) => (
                        <li
                            key={s.codprodu ?? i}
                            ref={(el) => (suggestionsRefs.current[i] = el)}
                            id={`search-option-${i}`}
                            role="option"
                            aria-selected={highlightedIndex === i}
                            className={`p-3 cursor-pointer transition-all duration-150 ease-in-out ${highlightedIndex === i ? 'bg-blue-100' : 'hover:bg-gray-100'
                                }`}
                            onMouseEnter={() => setHighlightedIndex(i)}
                            onClick={() => {
                                handleSuggestionClick(s);
                                setSuggestions([]);
                            }}
                        >
                            {s.desprodu}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBar;
