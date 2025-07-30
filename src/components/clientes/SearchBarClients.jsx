// src/components/clientes/SearchBarClients.jsx
import React, { useRef, useEffect, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import { useAuthContext } from '../../Auth/AuthContext';

// Normaliza cadena (letras, números y espacios)
function normalizeString(str) {
    return str
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
    handleSearchEnter
}) {
    const { token } = useAuthContext();
    const wrapperRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    useEffect(() => {
        function handleClickOutside(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowSuggestions(false);
                setActiveIndex(-1);
            }
        }
        function handleKey(e) {
            if (e.key === 'Escape') {
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
        const haystack = normalizeString(client.razclien + ' ' + client.codclien);
        return normalizeString(term)
            .split(' ')
            .every(token => haystack.includes(token));
    }

    async function fetchSuggestions(value) {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${encodeURIComponent(value)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSuggestions(data.filter(c => fuzzyFilter(c, value)));
        } catch {
            setSuggestions([]);
        }
    }

    const handleChange = e => {
        const val = e.target.value;
        setSearchTerm(val);
        if (normalizeString(val).length > 1) {
            setShowSuggestions(true);
            fetchSuggestions(val);
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
        setActiveIndex(-1);
    };

    const handleKeyDown = e => {
        if (!showSuggestions) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) {
                select(suggestions[activeIndex]);
            } else {
                setShowSuggestions(false);
                handleSearchEnter();
            }
        }
    };

    const select = client => {
        setSearchTerm(client.razclien);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setSuggestions([]);
        handleSuggestionClick(client);
        handleSearchEnter();
    };

    return (
        <div
            ref={wrapperRef}
            className="relative w-full max-w-lg mx-auto"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={showSuggestions}
        >
            <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o código..."
                    value={searchTerm}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-10 pr-10 py-2 border rounded-lg bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchTerm && (
                    <button
                        onClick={() => {
                            // Limpia el buscador y dispara la búsqueda vacía
                            setSearchTerm('');
                            setSuggestions([]);
                            setShowSuggestions(false);
                            setActiveIndex(-1);
                            handleSearchEnter();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label="Limpiar búsqueda"
                    >
                        <FiX />
                    </button>
                )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <ul
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow max-h-60 overflow-y-auto"
                    role="listbox"
                >
                    {suggestions.map((c, i) => (
                        <li
                            key={`${c.codclien}-${i}`}
                            role="option"
                            aria-selected={i === activeIndex}
                            className={`flex justify-between items-center px-3 py-2 cursor-pointer ${i === activeIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                                }`}
                            onMouseEnter={() => setActiveIndex(i)}
                            onClick={() => select(c)}
                        >
                            <div className="text-sm text-gray-800">{c.razclien}</div>
                            <div className="text-xs text-gray-500">{c.codclien}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
