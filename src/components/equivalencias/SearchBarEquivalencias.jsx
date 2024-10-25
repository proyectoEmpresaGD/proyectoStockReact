import { useRef, useEffect } from 'react';

const SearchBarEquivalencias = ({ searchTerm, setSearchTerm, suggestions, setSuggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) => {
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setSuggestions([]); // Cerrar las sugerencias cuando se hace clic fuera
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [wrapperRef, setSuggestions]);

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearchKeyPress(event);
            setSuggestions([]); // Cerrar las sugerencias al pulsar Enter
        }
    };

    return (
        <div ref={wrapperRef} className="relative mb-2 w-3/4 lg:w-1/2 mx-auto justify-center" role="search">
            <input
                type="text"
                aria-label="Buscar por producto proveedor"
                placeholder="Buscar por Producto Proveedor"
                value={searchTerm}
                onChange={handleSearchInputChange}
                onKeyPress={handleKeyPress}
                className="w-full p-3 border rounded-lg text-gray-700 bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition duration-200"
            />
            {suggestions.length > 0 && (
                <ul
                    className="absolute left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-30"
                    role="listbox"
                >
                    {suggestions.map((item, index) => (
                        <li
                            key={index}
                            role="option"
                            aria-selected={false}
                            className="p-3 hover:bg-gray-100 cursor-pointer"
                            onClick={() => {
                                handleSuggestionClick(item);
                                setSuggestions([]); // Cerrar las sugerencias al hacer clic en una opción
                            }}
                        >
                            <div className="font-bold">{item.desequiv}</div>
                            <div className="text-sm text-gray-600">{item.codequiv}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBarEquivalencias;
