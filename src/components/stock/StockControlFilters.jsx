import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Filter, RefreshCw, RotateCcw, Search } from 'lucide-react';

const MONTH_OPTIONS = [
    { value: '6', label: 'Últimos 6 meses' },
    { value: '12', label: 'Últimos 12 meses' },
    { value: '24', label: 'Últimos 24 meses' },
    { value: '36', label: 'Últimos 36 meses' },
];

const LIMIT_OPTIONS = [
    { value: '500', label: 'Hasta 500 productos' },
    { value: '1000', label: 'Hasta 1.000 productos' },
    { value: '2000', label: 'Hasta 2.000 productos' },
];

const normalizeOption = (option) => ({
    value: typeof option === 'string' ? option : option.value,
    label: typeof option === 'string' ? option : option.label,
});

function SearchableSelect({ label, value, options, placeholder, emptyLabel, loading, onChange }) {
    const wrapperRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const normalized = useMemo(() => options.map(normalizeOption), [options]);
    const selected = normalized.find((item) => item.value === value);
    const visible = useMemo(() => {
        const search = query.trim().toLocaleLowerCase('es');
        if (!search) return normalized;

        return normalized.filter((item) => (
            String(item.label || '').toLocaleLowerCase('es').includes(search)
            || String(item.value || '').toLocaleLowerCase('es').includes(search)
        ));
    }, [normalized, query]);

    useEffect(() => {
        const onPointerDown = (event) => {
            if (!wrapperRef.current?.contains(event.target)) {
                setOpen(false);
                setQuery('');
            }
        };

        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const clear = () => {
        onChange('');
        setQuery('');
        setOpen(false);
    };

    return (
        <label ref={wrapperRef} className="relative flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700">
            {label}
            <div className="relative">
                <input
                    type="search"
                    value={open ? query : selected?.label || ''}
                    onFocus={() => {
                        setQuery('');
                        setOpen(true);
                    }}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    placeholder={loading ? 'Cargando...' : placeholder}
                    className="cjm-input min-h-11 w-full rounded-xl px-3 py-2.5 pr-9"
                    aria-expanded={open}
                />
                {(value || (open && query)) && (
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={clear}
                        aria-label={`Limpiar ${label}`}
                    >
                        ×
                    </button>
                )}
            </div>

            {open && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="max-h-64 overflow-y-auto p-1">
                        <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={clear}
                        >
                            {emptyLabel}
                        </button>
                        {visible.length === 0 && (
                            <p className="px-3 py-3 text-sm text-slate-400">No hay coincidencias.</p>
                        )}
                        {visible.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className={`w-full rounded-lg px-3 py-2 text-left transition hover:bg-blue-50 ${item.value === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onChange(item.value);
                                    setOpen(false);
                                    setQuery('');
                                }}
                            >
                                <span className="block truncate text-sm font-medium">{item.label}</span>
                                <span className="block truncate text-xs text-slate-400">{item.value}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </label>
    );
}

function SelectField({ id, label, value, options, onChange }) {
    return (
        <label htmlFor={id} className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700">
            {label}
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="cjm-input min-h-11 w-full rounded-xl px-3 py-2.5"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
    );
}

function StockControlFilters({
    filters,
    filterOptions,
    loadingFilters,
    loading,
    onFilterChange,
    onReset,
    onApply,
}) {
    return (
        <section className="cjm-toolbar stock-control-filters">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="cjm-icon-tile h-10 w-10 shrink-0 rounded-xl">
                        <Filter size={19} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">Buscar y acotar productos</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Los cambios se aplican al pulsar «Ver resultados» para evitar recargas mientras escribes.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" onClick={onReset} className="cjm-ghost-button min-h-11">
                        <RotateCcw size={17} aria-hidden="true" />
                        Limpiar
                    </button>
                    <button type="button" onClick={onApply} className="cjm-primary-button min-h-11" disabled={loading}>
                        {loading ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
                        Ver resultados
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <SearchableSelect
                    label="Proveedor"
                    value={filters.provider}
                    options={filterOptions.providers}
                    placeholder="Todos los proveedores"
                    emptyLabel="Todos los proveedores"
                    loading={loadingFilters}
                    onChange={(value) => onFilterChange('provider', value)}
                />

                <SearchableSelect
                    label="Familia"
                    value={filters.collection}
                    options={filterOptions.collections}
                    placeholder="Todas las familias"
                    emptyLabel="Todas las familias"
                    loading={loadingFilters}
                    onChange={(value) => onFilterChange('collection', value)}
                />

                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700 xl:col-span-1">
                    Producto o código
                    <input
                        type="search"
                        value={filters.productName}
                        onChange={(event) => onFilterChange('productName', event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') onApply();
                        }}
                        placeholder="Ej. ARE00125 o Lino azul"
                        className="cjm-input min-h-11 w-full rounded-xl px-3 py-2.5"
                    />
                </label>

                <SelectField
                    id="stock-months"
                    label="Periodo para calcular consumo"
                    value={filters.monthsBack}
                    options={MONTH_OPTIONS}
                    onChange={(value) => onFilterChange('monthsBack', value)}
                />

                <SelectField
                    id="stock-limit"
                    label="Máximo de resultados"
                    value={filters.limit}
                    options={LIMIT_OPTIONS}
                    onChange={(value) => onFilterChange('limit', value)}
                />
            </div>
        </section>
    );
}

export default StockControlFilters;
