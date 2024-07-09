function SearchBar({ searchTerm, setSearchTerm, suggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) {
    return (
        <div className="relative mb-4">
            <input
                type="text"
                placeholder="Buscar por Nombre"
                value={searchTerm}
                onChange={handleSearchInputChange}
                onKeyPress={handleSearchKeyPress}
                className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30">
                    {suggestions.map(client => (
                        <li
                            key={client.codclien}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleSuggestionClick(client)}
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