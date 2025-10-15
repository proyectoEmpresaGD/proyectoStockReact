// src/components/agenda/SearchBarClientsNotas.jsx
import { useRef, useEffect, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext';

export default function SearchBar({
    searchTerm = '',
    setSearchTerm,
    suggestions = [],
    setSuggestions,
    handleSuggestionClick,
    handleSearchEnter = () => { },
    disabled = false,
}) {
    const { token } = useAuthContext();
    const wrapperRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Close dropdown when clicking outside
    useEffect(() => {
        const onClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    // Fuzzy filter helper
    const fuzzyFilter = (client, term) => {
        const tokens = term.toLowerCase().split(/\s+/).filter(Boolean);
        const haystack = (client.razclien + ' ' + client.codclien).toLowerCase();
        return tokens.every((t) => haystack.includes(t));
    };

    const handleInputChange = async (e) => {
        if (disabled) return;
        const value = e.target.value;
        setSearchTerm(value);

        if (value.length > 1) {
            setShowSuggestions(true);
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${encodeURIComponent(
                        value
                    )}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setSuggestions(data.filter((c) => fuzzyFilter(c, value)));
            } catch (err) {
                console.error('Error fetching suggestions:', err);
                setSuggestions([]);
            }
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
    };

    const handleKeyDown = (e) => {
        if (disabled) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            setShowSuggestions(false);
            handleSearchEnter();
        }
    };

    return (
        <div ref={wrapperRef} className="relative w-full" role="search">
            <input
                type="text"
                aria-label="Buscar cliente por nombre o código"
                placeholder="Buscar cliente por nombre"
                value={searchTerm}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border rounded text-sm border-gray-300 text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                disabled={disabled}
            />

            {showSuggestions && suggestions.length > 0 && (
                <ul
                    className="absolute left-0 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto z-10"
                    role="listbox"
                >
                    {suggestions.map((client, idx) => (
                        <li
                            key={`${client.codclien}-${idx}`}
                            role="option"
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => {
                                if (disabled) return;
                                setSearchTerm(client.razclien);
                                setShowSuggestions(false);
                                handleSuggestionClick(client);
                                handleSearchEnter();
                            }}
                        >
                            <div className="font-medium text-gray-800">{client.razclien}</div>
                            <div className="text-xs text-gray-500">{client.codclien}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
