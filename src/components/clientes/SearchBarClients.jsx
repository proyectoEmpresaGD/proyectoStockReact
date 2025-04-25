import { useRef, useEffect, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext'; // Importa el contexto de autenticación

function SearchBar({
    searchTerm,
    setSearchTerm,
    suggestions,
    setSuggestions,
    handleSuggestionClick,
    handleSearchEnter
}) {
    const { token } = useAuthContext(); // Obtén el token del contexto de autenticación
    const wrapperRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Cerrar dropdown al clicar fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtrado difuso: todas las palabras que escribas pueden ir en cualquier parte del nombre o código
    const fuzzyFilter = (client, term) => {
        const tokens = term.toLowerCase().split(/\s+/).filter(Boolean);
        const haystack = (client.razclien + ' ' + client.codclien).toLowerCase();
        return tokens.every(t => haystack.includes(t));
    };

    const handleInputChange = async (e) => {
        const value = e.target.value;
        setSearchTerm(value);

        if (value.length > 1) {
            setShowSuggestions(true);
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${encodeURIComponent(value)}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                // Aplica aquí el filtrado difuso
                setSuggestions(data.filter(c => fuzzyFilter(c, value)));
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
        if (e.key === 'Enter') {
            setShowSuggestions(false);
            handleSearchEnter();
        }
    };

    return (
        <div ref={wrapperRef} className="relative mx-auto w-3/4" role="search">
            <input
                type="text"
                aria-label="Buscar por nombre o código de cliente"
                placeholder="Buscar por Nombre o Código"
                value={searchTerm}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul
                    className="absolute left-0 w-full mt-2 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto z-10"
                    role="listbox"
                >
                    {suggestions.map(client => (
                        <li
                            key={client.codclien}
                            role="option"
                            aria-selected="false"
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => {
                                // 1) Actualizamos el searchTerm
                                setSearchTerm(client.razclien);
                                // 2) Cerramos el desplegable
                                setShowSuggestions(false);
                                // 3) Indicamos al padre que seleccione SOLO ese cliente
                                handleSuggestionClick(client);
                                // 4) Lanzamos la búsqueda para que la vista muestre únicamente el seleccionado
                                handleSearchEnter();
                            }}
                        >
                            <div className="font-bold">{client.razclien}</div>
                            <div className="text-sm text-gray-600">{client.codclien}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default SearchBar;
