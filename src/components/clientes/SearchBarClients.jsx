import { useRef, useEffect, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext'; // Importa el contexto de autenticación

function SearchBar({ searchTerm, setSearchTerm, suggestions, setSuggestions, handleSuggestionClick, handleSearchEnter }) {
    const { token } = useAuthContext(); // Obtén el token del contexto de autenticación
    const wrapperRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [wrapperRef]);

    const handleInputChange = async (event) => {
        const value = event.target.value;
        setSearchTerm(value);

        if (value.length > 1) {
            setShowSuggestions(true);

            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${value}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setSuggestions(data); // Actualiza las sugerencias con los datos del backend
            } catch (error) {
                console.error('Error fetching suggestions:', error);
                setSuggestions([]); // Asegúrate de limpiar las sugerencias en caso de error
            }
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            setShowSuggestions(false);
            handleSearchEnter(); // Llama a la función de búsqueda principal
        }
    };

    return (
        <div ref={wrapperRef} className="relative mx-auto w-3/4" role="search">
            <input
                type="text"
                aria-label="Buscar por nombre de cliente"
                placeholder="Buscar por Nombre"
                value={searchTerm}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown} // Usa onKeyDown para capturar la tecla Enter
                className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul
                    className="absolute left-0 w-full mt-2 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto z-10"
                    role="listbox"
                >
                    {suggestions.map((client) => (
                        <li
                            key={client.codclien}
                            role="option"
                            aria-selected={false}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => {
                                handleSuggestionClick(client);
                                setShowSuggestions(false);
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
