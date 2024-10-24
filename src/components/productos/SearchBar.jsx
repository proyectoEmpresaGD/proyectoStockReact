import React, { useEffect, useRef } from 'react';
import { AiOutlineSearch } from 'react-icons/ai';

const SearchBar = ({ searchTerm, setSearchTerm, suggestions, setSuggestions, handleSearchInputChange, handleSearchKeyPress, handleSuggestionClick }) => {
    const inputRef = useRef(null);

    // Use effect to handle click outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (inputRef.current && !inputRef.current.contains(event.target)) {
                setSuggestions([]); // Close suggestions when clicking outside
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [setSuggestions]);

    // Handle the key press for "Enter" and ensure suggestions are closed
    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default behavior
            setSuggestions([]); // Clear suggestions immediately
            handleSearchKeyPress(event); // Perform search
        }
    };

    return (
        <div className="mb-2 w-3/4 md:w-1/2 mx-auto justify-center" ref={inputRef}>
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchInputChange}
                    onKeyPress={handleKeyPress}
                    className="w-full p-2 border rounded-lg text-gray-700 bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition duration-200"
                    placeholder="Buscar productos..."
                />
                <AiOutlineSearch className="absolute right-3 top-3 text-gray-500" size={20} />
            </div>
            {suggestions.length > 0 && (
                <ul className="absolute left-0 mx-auto w-2/4 right-0 mt-2 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-30">
                    {suggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            className="p-3 cursor-pointer hover:bg-gray-100 text-gray-700 transition-all duration-200 ease-in-out"
                            onClick={() => {
                                handleSuggestionClick(suggestion);
                                setSuggestions([]); // Close suggestions on suggestion click
                            }}
                        >
                            {suggestion.desprodu}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBar;
