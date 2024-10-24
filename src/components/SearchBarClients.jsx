import { useRef, useEffect } from 'react';

function SearchBar({ searchTerm, setSearchTerm, suggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) {
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setSearchTerm('');
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [wrapperRef, setSearchTerm]);

    const escapeHtml = (text) => {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    };

    return (
        <div ref={wrapperRef} className="relative mx-auto w-3/4 " role="search">
            <input
                type="text"
                aria-label="Buscar por nombre de cliente"
                placeholder="Buscar por Nombre"
                value={searchTerm}
                onChange={handleSearchInputChange}
                onKeyPress={handleSearchKeyPress}
                className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {suggestions.length > 0 && (
                <ul
                    className="absolute left-0 w-4/4 right-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-10"
                    role="listbox"
                >
                    {suggestions.map((client) => (
                        <li
                            key={client.codclien}
                            role="option"
                            aria-selected={false}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleSuggestionClick(client)} // Cerrar sugerencias al seleccionar una opción
                        >
                            <div className="font-bold" dangerouslySetInnerHTML={{ __html: escapeHtml(client.razclien) }} />
                            <div className="text-sm text-gray-600">{client.codclien}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default SearchBar;

