import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Campo de búsqueda con sugerencias al escribir (sin selector desplegable).
 * Se mantiene reutilizable en preparación y recepción.
 */
export default function SgaSuggestInput({
    value, onChange, options = [], getKey, getLabel, getDetail, onSelect,
    placeholder = 'Buscar…', label = 'Buscar', showSuggestions = true,
}) {
    const id = useId();
    const ref = useRef(null);
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState(0);
    const hasQuery = String(value ?? '').trim().length > 0;
    const suggestions = hasQuery ? options.slice(0, 8) : [];
    const expanded = showSuggestions && open && suggestions.length > 0;

    useEffect(() => setCurrent(0), [value]);
    useEffect(() => {
        const closeOutside = (event) => {
            if (!ref.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, []);

    const choose = (item) => {
        setOpen(false);
        onSelect(item);
    };

    return <div ref={ref} className="sga-suggest sga-search-autocomplete">
        <label htmlFor={`${id}-input`}>{label}</label>
        <div className="sga-suggest-input sga-suggest-input--plain">
            <Search size={22} aria-hidden="true"/>
            <input id={`${id}-input`} type="search" autoComplete="off" enterKeyHint="search"
                value={value} placeholder={placeholder}
                role={showSuggestions ? 'combobox' : undefined}
                aria-autocomplete={showSuggestions ? 'list' : undefined}
                aria-expanded={showSuggestions ? expanded : undefined}
                aria-controls={showSuggestions ? `${id}-options` : undefined}
                aria-activedescendant={expanded ? `${id}-option-${current}` : undefined}
                onChange={(event) => {
                    onChange(event.target.value);
                    setOpen(showSuggestions && event.target.value.trim().length > 0);
                }}
                onFocus={() => { if (showSuggestions && hasQuery) setOpen(true); }}
                onKeyDown={(event) => {
                    if (!showSuggestions) return;
                    if (event.key === 'Escape') { setOpen(false); return; }
                    if (event.key === 'ArrowDown' && suggestions.length) {
                        event.preventDefault(); setOpen(true);
                        setCurrent((index) => Math.min(index + 1, suggestions.length - 1));
                    }
                    if (event.key === 'ArrowUp' && suggestions.length) {
                        event.preventDefault(); setOpen(true);
                        setCurrent((index) => Math.max(index - 1, 0));
                    }
                    if (event.key === 'Enter' && expanded && suggestions[current]) {
                        event.preventDefault(); choose(suggestions[current]);
                    }
                }}
            />
        </div>
        {expanded && <div id={`${id}-options`} role="listbox" className="sga-suggest-options sga-search-autocomplete-results">
            {suggestions.map((item, index) => <button type="button" role="option"
                id={`${id}-option-${index}`} aria-selected={index === current}
                key={getKey(item)} className={index === current ? 'is-highlighted' : ''}
                onPointerEnter={() => setCurrent(index)} onClick={() => choose(item)}>
                <strong>{getLabel(item)}</strong>
                {getDetail && <small>{getDetail(item)}</small>}
            </button>)}
        </div>}
        {showSuggestions && open && hasQuery && suggestions.length === 0 &&
            <p className="sga-suggest-empty sga-search-autocomplete-empty" role="status"><TranslatedText>No hay coincidencias</TranslatedText></p>}
    </div>;
}
