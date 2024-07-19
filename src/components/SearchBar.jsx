import React, { useRef, useEffect } from 'react';

function SearchBar({ searchTerm, setSearchTerm, suggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) {
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setSearchTerm(''); // Opcional: puedes establecer esto en otra acción si deseas que el término de búsqueda se borre
                suggestions.length = 0; // Vacía las sugerencias para cerrar el menú
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [wrapperRef, setSearchTerm, suggestions]);

    return (
        <div ref={wrapperRef} className="relative mb-4">
            <input
                type="text"
                placeholder="Buscar por Nombre"
                value={searchTerm}
                onChange={handleSearchInputChange}
                onKeyPress={handleSearchKeyPress}
                className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-2 bg-white border border-gray-300 rounded shadow-lg">
                    {suggestions.map(product => (
                        <li
                            key={product.codprodu}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleSuggestionClick(product)}
                        >
                            <div className="font-bold">{product.desprodu}</div>
                            <div className="text-sm text-gray-600">{product.codprodu}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default SearchBar;
