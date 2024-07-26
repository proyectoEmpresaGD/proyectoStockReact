import { useRef, useEffect } from 'react';

const SearchBar = ({ searchTerm, setSearchTerm, suggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) => {
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setSearchTerm('');
                suggestions.length = 0;
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
                <ul className="absolute left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded shadow-lg">
                    {suggestions.map((item, index) => (
                        <li
                            key={index}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleSuggestionClick(item)}
                        >
                            <div className="font-bold">{item.desprodu}</div>
                            <div className="text-sm text-gray-600">{item.codprodu}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBar;
