import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/** Same workflow as Stock+: suggestions + arrows + Enter + tap, scanner friendly. */
export default function SgaSuggestInput({ value, onChange, options, getKey, getLabel, getDetail, onSelect, placeholder = 'Buscar…', label = 'Buscar' }) {
    const id = useId();
    const ref = useRef(null);
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState(0);
    const suggestions = options.slice(0, 8);
    useEffect(() => setCurrent(0), [value]);
    useEffect(() => {
        const handler = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    }, []);
    const choose = (item) => { onSelect(item); setOpen(false); };
    return <div ref={ref} className="sga-suggest" role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={`${id}-options`}>
        <label htmlFor={`${id}-input`}>{label}</label>
        <div className="sga-suggest-input"><Search size={23} aria-hidden="true"/><input
            id={`${id}-input`} autoComplete="off" enterKeyHint="search" aria-autocomplete="list" value={value}
            onChange={(event) => { onChange(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
                if (event.key === 'Escape') { setOpen(false); return; }
                if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setCurrent((index) => Math.min(index + 1, suggestions.length - 1)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setCurrent((index) => Math.max(index - 1, 0)); }
                if (event.key === 'Enter') { event.preventDefault(); if (suggestions[current]) choose(suggestions[current]); }
            }}
            placeholder={placeholder}
        /><button type="button" title="Ver sugerencias" aria-label="Mostrar sugerencias" onClick={() => setOpen((prev) => !prev)}><ChevronDown size={22}/></button></div>
        {open && suggestions.length > 0 && <div id={`${id}-options`} role="listbox" className="sga-suggest-options">
            {suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === current}
                key={getKey(item)} className={current === index ? 'is-highlighted' : ''}
                onPointerEnter={() => setCurrent(index)} onClick={() => choose(item)}>
                <strong>{getLabel(item)}</strong><small>{getDetail(item)}</small>
            </button>)}
        </div>}
        {open && suggestions.length === 0 && !!String(value).trim() && <p className="sga-suggest-empty">No hay coincidencias</p>}
    </div>;
}
