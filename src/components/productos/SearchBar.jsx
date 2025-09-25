// src/components/productos/SearchBar.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AiOutlineSearch } from 'react-icons/ai';
import debounce from 'lodash.debounce';

const SearchBar = ({
    searchTerm,                   // valor que puede venir “desde fuera” (limpiar, cargar)
    setSearchTerm,               // (opcional) si quieres reflejarlo en el padre inmediatamente
    suggestions,
    setSuggestions,
    handleSearchKeyPress,        // búsqueda inmediata al pulsar Enter / icono
    handleSuggestionClick,
    handleSearchInputChange      // callback debounced hacia arriba
}) => {
    const [localTerm, setLocalTerm] = useState(searchTerm || '');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const wrapperRef = useRef(null);
    const suggestionsRefs = useRef([]);
    const lastEmittedRef = useRef(searchTerm || ''); // último valor que enviamos hacia arriba

    // Debounce para emitir cambios al padre (con cleanup)
    const debouncedUpdate = useMemo(() => {
        const fn = debounce((value) => {
            lastEmittedRef.current = value;        // marcamos lo que emitimos
            handleSearchInputChange?.({ target: { value } });
            // Si quieres mantener un espejo inmediato en el padre, descomenta:
            // setSearchTerm?.(value);
        }, 300);
        return fn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleSearchInputChange]);

    useEffect(() => {
        return () => debouncedUpdate.cancel();
    }, [debouncedUpdate]);

    // Solo sincroniza desde fuera si el valor “entrante” es distinto del último emitido localmente.
    // Esto permite que un “Clear” externo actualice el input, pero evita saltos hacia atrás al tipear rápido.
    useEffect(() => {
        const incoming = (searchTerm ?? '');
        if (incoming !== lastEmittedRef.current) {
            setLocalTerm(incoming.toUpperCase()); // mantenemos tu comportamiento de mayúsculas
            setHighlightedIndex(0);
        }
    }, [searchTerm]);

    // Cambio local del input (sincroniza solo local + emite con debounce)
    const onInputChange = (e) => {
        const value = (e.target.value || '').toUpperCase(); // forzar mayúsculas
        setLocalTerm(value);
        debouncedUpdate(value);
    };

    // Cerrar sugerencias al hacer clic fuera
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

    // Navegación por teclado
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
                    handleSearchKeyPress(e);
                }
            }
        } else if (e.key === 'Enter') {
            handleSearchKeyPress(e);
        }
    };

    // Auto-scroll para mantener la opción destacada visible
    useEffect(() => {
        const el = suggestionsRefs.current[highlightedIndex];
        if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [highlightedIndex, suggestions]);

    // Disparar búsqueda al hacer clic en el icono
    const onIconClick = () => {
        handleSearchKeyPress?.({ key: 'Enter' });
        setSuggestions([]);
    };

    // Reset de índice cuando cambian sugerencias o el término
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
                    aria-activedescendant={
                        suggestions.length > 0 ? `search-option-${highlightedIndex}` : undefined
                    }
                    className="w-full p-2 pr-10 border rounded-lg uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition duration-200"
                    placeholder="Buscar productos..."
                />
                <AiOutlineSearch
                    onClick={onIconClick}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500"
                    size={20}
                    aria-label="Buscar"
                />
            </div>

            {suggestions.length > 0 && (
                <ul
                    id="search-listbox"
                    role="listbox"
                    className="absolute z-30 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
                >
                    {suggestions.map((s, i) => (
                        <li
                            key={s.codprodu ?? i}
                            ref={(el) => (suggestionsRefs.current[i] = el)}
                            id={`search-option-${i}`}
                            role="option"
                            aria-selected={highlightedIndex === i}
                            className={`p-2 cursor-pointer transition-all duration-150 ease-in-out ${highlightedIndex === i ? 'bg-blue-100' : 'hover:bg-gray-100'
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
