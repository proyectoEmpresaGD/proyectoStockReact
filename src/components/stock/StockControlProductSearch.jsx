import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import { fetchStockControlSuggestions } from '../../services/stockControlClient.js';

/** Busca en el catálogo activo, sin ejecutar la consulta pesada de planificación. */
export default function StockControlProductSearch({ value, onChange, onApply, onSelect, token, rows = [] }) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const containerRef = useRef(null);
    const search = value.trim();

    const localMatches = useMemo(() => {
        if (!open || search.length < 2) return [];
        const words = search.toLocaleLowerCase('es').split(/\s+/).filter(Boolean);
        return rows.filter((product) => words.every((word) =>
            String(product.codprodu || '').toLocaleLowerCase('es').includes(word)
            || String(product.desprodu || '').toLocaleLowerCase('es').includes(word)
        )).slice(0, 10).map(({ codprodu, desprodu }) => ({ codprodu, desprodu }));
    }, [search, rows, open]);

    // Las sugerencias locales salen inmediatamente; la API busca también referencias
    // fuera de los primeros 2.000 resultados de planificación.
    useEffect(() => {
        const controller = new AbortController();
        if (!token || !open || search.length < 2) {
            setSuggestions([]);
            setPending(false);
            return () => controller.abort();
        }
        setSuggestions(localMatches);
        setHighlighted(-1);
        setPending(true);
        const timer = setTimeout(() => {
            fetchStockControlSuggestions({ token, query: search, signal: controller.signal })
                .then((data) => {
                    if (!controller.signal.aborted) setSuggestions(data);
                })
                .catch(() => {
                    // Si falla el endpoint, conservamos las coincidencias locales.
                    if (!controller.signal.aborted) setSuggestions(localMatches);
                })
                .finally(() => {
                    if (!controller.signal.aborted) setPending(false);
                });
        }, 250);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [token, open, search, localMatches]);

    useEffect(() => {
        const closeOnOutside = (event) => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutside);
        return () => document.removeEventListener('pointerdown', closeOnOutside);
    }, []);

    const visible = open && search.length >= 2;
    const choose = (item) => {
        onSelect(item.codprodu);
        setOpen(false);
        setHighlighted(-1);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            setOpen(false);
            setHighlighted(-1);
        } else if (visible && suggestions.length && event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlighted((value) => (value + 1) % suggestions.length);
        } else if (visible && suggestions.length && event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted((value) => value <= 0 ? suggestions.length - 1 : value - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (visible && highlighted >= 0 && suggestions[highlighted]) {
                choose(suggestions[highlighted]);
            } else {
                setOpen(false);
                onApply(search);
            }
        }
    };

    return (
        <div ref={containerRef} className="relative flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700 xl:col-span-1">
            <label htmlFor="stock-product-search"><TranslatedText>Producto o código</TranslatedText></label>
            <div className="relative">
                <input
                    id="stock-product-search"
                    type="search"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => { onChange(event.target.value); setOpen(true); setHighlighted(-1); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ej. ARE00125 o Lino azul"
                    className="cjm-input min-h-11 w-full rounded-xl px-3 py-2.5 pr-10"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={visible}
                    aria-controls="stock-product-options"
                    aria-activedescendant={highlighted >= 0 && visible ? `stock-product-option-${highlighted}` : undefined}
                />
                <Search aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
            </div>
            {visible && (
                <div id="stock-product-options" role="listbox" aria-label="Sugerencias de productos" className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    {suggestions.map((item, index) => (
                        <button
                            id={`stock-product-option-${index}`}
                            role="option"
                            aria-selected={highlighted === index}
                            key={item.codprodu}
                            type="button"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => choose(item)}
                            className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 ${highlighted === index ? 'bg-blue-50' : ''}`}
                        >
                            <strong className="block text-sm text-slate-800">{item.codprodu}</strong>
                            <span className="block truncate text-xs font-normal text-slate-500">{item.desprodu}</span>
                        </button>
                    ))}
                    {suggestions.length === 0 && (
                        <p className="px-3 py-3 text-xs font-normal text-slate-500" role="status">
                            {pending ? 'Buscando referencias…' : 'Sin sugerencias. Puedes buscar igualmente con «Ver resultados».'}
                        </p>
                    )}
                    {suggestions.length > 0 && <p className="px-3 py-2 text-[11px] font-normal text-slate-400">Selecciona una referencia para aplicar los filtros.</p>}
                </div>
            )}
        </div>
    );
}
