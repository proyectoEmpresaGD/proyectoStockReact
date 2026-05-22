const MONTH_OPTIONS = [
    { value: '6', label: 'Últimos 6 meses' },
    { value: '12', label: 'Últimos 12 meses' },
    { value: '24', label: 'Últimos 24 meses' },
    { value: '36', label: 'Últimos 36 meses' },
];

const LIMIT_OPTIONS = [
    { value: '100', label: '100 productos' },
    { value: '500', label: '500 productos' },
    { value: '1000', label: '1000 productos' },
    { value: '2000', label: '2000 productos' },
];

const SelectField = ({ id, label, value, options, onChange, placeholder }) => (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        {label}
        <select
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        >
            <option value="">{placeholder}</option>
            {options.map((option) => {
                const optionValue = typeof option === 'string' ? option : option.value;
                const optionLabel = typeof option === 'string' ? option : option.label;

                return (
                    <option key={optionValue} value={optionValue}>
                        {optionLabel}
                    </option>
                );
            })}
        </select>
    </label>
);

function StockControlFilters({
    filters,
    filterOptions,
    loadingFilters,
    onFilterChange,
    onReset,
    onReload,
}) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-900">Filtros</h2>
                    <p className="text-sm text-slate-500">
                        Filtra por proveedor, colección y nombre de producto.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onReset}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Limpiar
                    </button>
                    <button
                        type="button"
                        onClick={onReload}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                        Actualizar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <SelectField
                    id="stock-provider"
                    label="Proveedor"
                    value={filters.provider}
                    options={filterOptions.providers}
                    onChange={(value) => onFilterChange('provider', value)}
                    placeholder={loadingFilters ? 'Cargando proveedores...' : 'Todos'}
                />

                <SelectField
                    id="stock-collection"
                    label="Colección"
                    value={filters.collection}
                    options={filterOptions.collections}
                    onChange={(value) => onFilterChange('collection', value)}
                    placeholder={loadingFilters ? 'Cargando colecciones...' : 'Todas'}
                />

                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 md:col-span-1">
                    Nombre producto
                    <input
                        type="search"
                        value={filters.productName}
                        onChange={(event) => onFilterChange('productName', event.target.value)}
                        placeholder="Ej. lino azul"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                </label>

                <SelectField
                    id="stock-months"
                    label="Consumo"
                    value={filters.monthsBack}
                    options={MONTH_OPTIONS}
                    onChange={(value) => onFilterChange('monthsBack', value)}
                    placeholder="Periodo"
                />

                <SelectField
                    id="stock-limit"
                    label="Límite"
                    value={filters.limit}
                    options={LIMIT_OPTIONS}
                    onChange={(value) => onFilterChange('limit', value)}
                    placeholder="Límite"
                />
            </div>
        </section>
    );
}

export default StockControlFilters;