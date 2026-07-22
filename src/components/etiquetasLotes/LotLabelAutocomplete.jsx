import React, {
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

const LotLabelAutocomplete = ({
    value = '',
    suggestions = [],
    onChange,
    onSelect,
    onSearch,
    onCloseSuggestions,
    placeholder = '',
    disabled = false,
    minimumCharacters = 1,
    getSuggestionKey,
    renderSuggestion,
    emptyMessage = 'No se encontraron coincidencias.',
}) => {
    const generatedId = useId();
    const listboxId = `lot-label-autocomplete-${generatedId}`;

    const wrapperRef = useRef(null);
    const optionRefs = useRef([]);

    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const textValue = String(value || '');
    const hasEnoughCharacters =
        textValue.trim().length >= minimumCharacters;

    useEffect(() => {
        // Ninguna sugerencia queda preseleccionada al cambiar el texto.
        setHighlightedIndex(-1);
    }, [textValue, suggestions]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target)
            ) {
                setIsOpen(false);
                setHighlightedIndex(-1);
                onCloseSuggestions?.();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [onCloseSuggestions]);

    useEffect(() => {
        if (highlightedIndex < 0) return;

        optionRefs.current[highlightedIndex]?.scrollIntoView({
            block: 'nearest',
        });
    }, [highlightedIndex]);

    const closeSuggestions = () => {
        setIsOpen(false);
        setHighlightedIndex(-1);
        onCloseSuggestions?.();
    };

    const selectSuggestion = (suggestion) => {
        if (!suggestion) return;

        onSelect?.(suggestion);
        setIsOpen(false);
        setHighlightedIndex(-1);
    };

    const handleInputChange = (event) => {
        // No aplicamos trim: los espacios se conservan mientras se edita.
        const nextValue = String(event.target.value || '').toUpperCase();

        onChange?.(nextValue);
        setHighlightedIndex(-1);
        setIsOpen(nextValue.trim().length >= minimumCharacters);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSuggestions();
            return;
        }

        if (event.key === 'ArrowDown') {
            if (suggestions.length === 0) return;

            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((currentIndex) =>
                currentIndex < 0 || currentIndex >= suggestions.length - 1
                    ? 0
                    : currentIndex + 1
            );
            return;
        }

        if (event.key === 'ArrowUp') {
            if (suggestions.length === 0) return;

            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((currentIndex) =>
                currentIndex <= 0
                    ? suggestions.length - 1
                    : currentIndex - 1
            );
            return;
        }

        if (event.key !== 'Enter') return;

        event.preventDefault();

        // Enter solo selecciona una opción marcada con las flechas.
        if (
            highlightedIndex >= 0 &&
            suggestions[highlightedIndex]
        ) {
            selectSuggestion(suggestions[highlightedIndex]);
            return;
        }

        setIsOpen(false);
        setHighlightedIndex(-1);
        onSearch?.();
    };

    const showSuggestions =
        isOpen && hasEnoughCharacters && suggestions.length > 0;

    const showEmptyMessage =
        isOpen && hasEnoughCharacters && suggestions.length === 0;

    return (
        <div
            ref={wrapperRef}
            className="relative w-full"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-haspopup="listbox"
            aria-controls={listboxId}
        >
            <input
                type="text"
                value={textValue}
                disabled={disabled}
                autoComplete="off"
                spellCheck="false"
                placeholder={placeholder}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (hasEnoughCharacters) setIsOpen(true);
                }}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={
                    highlightedIndex >= 0
                        ? `${listboxId}-option-${highlightedIndex}`
                        : undefined
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            />

            {showSuggestions && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
                >
                    {suggestions.map((suggestion, index) => {
                        const selected = highlightedIndex === index;
                        const suggestionKey =
                            getSuggestionKey?.(suggestion, index) ??
                            suggestion?.id ??
                            suggestion?.value ??
                            suggestion?.codprodu ??
                            `${index}`;

                        return (
                            <li
                                key={suggestionKey}
                                id={`${listboxId}-option-${index}`}
                                ref={(element) => {
                                    optionRefs.current[index] = element;
                                }}
                                role="option"
                                aria-selected={selected}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                onClick={() => selectSuggestion(suggestion)}
                                className={[
                                    'cursor-pointer px-3 py-2 transition',
                                    selected
                                        ? 'bg-blue-100'
                                        : 'hover:bg-slate-100',
                                ].join(' ')}
                            >
                                {renderSuggestion ? (
                                    renderSuggestion(suggestion)
                                ) : (
                                    <>
                                        <div className="text-sm font-semibold text-slate-800">
                                            {suggestion?.label ??
                                                suggestion?.value ??
                                                suggestion?.desprodu ??
                                                suggestion?.codprodu}
                                        </div>

                                        {suggestion?.description && (
                                            <div className="mt-0.5 text-xs text-slate-500">
                                                {suggestion.description}
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {showEmptyMessage && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-xl">
                    {emptyMessage}
                </div>
            )}
        </div>
    );
};

export default LotLabelAutocomplete;
