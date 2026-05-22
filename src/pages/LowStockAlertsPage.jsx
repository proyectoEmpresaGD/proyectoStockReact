import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { IoClose } from 'react-icons/io5';
import { useAuthContext } from '../Auth/AuthContext';
import PageShell from '../common/PageShell.jsx';

const DEFAULT_FILTERS = {
    proveedor: '',
    coleccion: '',
    nombreProducto: '',
    mesesConsumo: '12',
};

const MESES_CONSUMO_OPTIONS = [
    { value: '6', label: 'Últimos 6 meses' },
    { value: '12', label: 'Últimos 12 meses' },
    { value: '24', label: 'Últimos 24 meses' },
    { value: '36', label: 'Últimos 36 meses' },
];

const formatNumber = (value, decimals = 2) => {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return '0,00';
    }

    return numberValue.toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL;

const normalizeOption = (option) => ({
    value: typeof option === 'string' ? option : option.value,
    label: typeof option === 'string' ? option : option.label,
});

function SearchableCombobox({
    label,
    value,
    options,
    placeholder,
    emptyLabel,
    loading,
    onChange,
}) {
    const containerRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [searchText, setSearchText] = useState('');

    const normalizedOptions = useMemo(() => {
        return options.map((option) => normalizeOption(option));
    }, [options]);

    const selectedOption = normalizedOptions.find((option) => option.value === value);

    const filteredOptions = useMemo(() => {
        const search = searchText.trim().toLowerCase();

        if (!search) {
            return normalizedOptions;
        }

        return normalizedOptions.filter((option) => {
            const optionLabel = String(option.label || '').toLowerCase();
            const optionValue = String(option.value || '').toLowerCase();

            return optionLabel.includes(search) || optionValue.includes(search);
        });
    }, [normalizedOptions, searchText]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!containerRef.current) return;

            if (!containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchText('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const openCombobox = () => {
        setSearchText(selectedOption?.label || '');
        setIsOpen(true);
    };

    const selectOption = (option) => {
        onChange(option.value);
        setSearchText(option.label);
        setIsOpen(false);
    };

    const clearSelection = () => {
        onChange('');
        setSearchText('');
        setIsOpen(false);
    };

    return (
        <div
            ref={containerRef}
            className="relative flex flex-col gap-1 text-sm font-medium text-slate-700"
        >
            <span>{label}</span>

            <input
                type="search"
                value={isOpen ? searchText : selectedOption?.label || ''}
                onFocus={openCombobox}
                onClick={openCombobox}
                onChange={(event) => {
                    setSearchText(event.target.value);
                    setIsOpen(true);
                }}
                placeholder={loading ? 'Cargando...' : placeholder}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />

            {(value || searchText) && (
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearSelection}
                    className="absolute right-3 top-[31px] text-lg leading-none text-slate-400 hover:text-slate-700"
                    aria-label={`Limpiar ${label}`}
                >
                    ×
                </button>
            )}

            {isOpen && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="max-h-64 overflow-y-auto p-1">
                        <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={clearSelection}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-500 hover:bg-slate-100"
                        >
                            {emptyLabel}
                        </button>

                        {filteredOptions.length === 0 && (
                            <div className="px-3 py-2 text-sm font-normal text-slate-400">
                                No hay resultados
                            </div>
                        )}

                        {filteredOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectOption(option)}
                                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-blue-50 ${option.value === value
                                    ? 'bg-blue-50 font-semibold text-blue-700'
                                    : 'text-slate-700'
                                    }`}
                                title={`${option.label} (${option.value})`}
                            >
                                <span className="block truncate">
                                    {option.label}
                                </span>
                                <span className="block text-xs text-slate-400">
                                    {option.value}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function LowStockAlertsPage() {
    const { token } = useAuthContext();

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [filterOptions, setFilterOptions] = useState({
        proveedores: [],
        colecciones: [],
    });

    const [products, setProducts] = useState([]);
    const [selectedProductCode, setSelectedProductCode] = useState('');
    const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [error, setError] = useState('');

    const selectedProduct = useMemo(() => {
        return products.find((product) => product.codprodu === selectedProductCode) || null;
    }, [products, selectedProductCode]);

    const updateFilter = (key, value) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const resetFilters = () => {
        setFilters(DEFAULT_FILTERS);
    };

    const buildQueryString = () => {
        const queryParams = new URLSearchParams();

        if (filters.proveedor) {
            queryParams.set('provider', filters.proveedor);
        }

        if (filters.coleccion) {
            queryParams.set('collection', filters.coleccion);
        }

        if (filters.nombreProducto) {
            queryParams.set('productName', filters.nombreProducto);
        }

        if (filters.mesesConsumo) {
            queryParams.set('monthsBack', filters.mesesConsumo);
        }

        queryParams.set('limit', '500');

        return queryParams.toString();
    };

    const fetchFilters = async () => {
        if (!token) return;

        setLoadingFilters(true);

        try {
            const response = await fetch(`${getApiBaseUrl()}/api/stock/control-stock/filters`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();

            setFilterOptions({
                proveedores: Array.isArray(data?.providers) ? data.providers : [],
                colecciones: Array.isArray(data?.collections) ? data.collections : [],
            });
        } catch {
            setFilterOptions({
                proveedores: [],
                colecciones: [],
            });
        } finally {
            setLoadingFilters(false);
        }
    };

    const fetchStockControl = async () => {
        if (!token) return;

        setLoading(true);
        setError('');

        try {
            const queryString = buildQueryString();

            const response = await fetch(
                `${getApiBaseUrl()}/api/stock/control-stock?${queryString}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            const safeProducts = Array.isArray(data) ? data : [];

            setProducts(safeProducts);
            setSelectedProductCode((currentCode) => {
                const currentProductExists = safeProducts.some((product) => product.codprodu === currentCode);

                if (currentProductExists) {
                    return currentCode;
                }

                return '';
            });
        } catch (e) {
            setProducts([]);
            setSelectedProductCode('');
            setError(e.message || 'Error cargando el control de stock.');
        } finally {
            setLoading(false);
        }
    };

    const openConsumptionModal = (productCode) => {
        setSelectedProductCode(productCode);
        setIsConsumptionModalOpen(true);
    };

    const closeConsumptionModal = () => {
        setIsConsumptionModalOpen(false);
    };

    useEffect(() => {
        fetchFilters();
    }, [token]);

    useEffect(() => {
        fetchStockControl();
    }, [token, filters]);

    return (
        <PageShell maxWidth="max-w-8xl" className="mt-16 sm:mt-20">
            <header className="mb-8 text-center">
                <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                    Control de stock
                </h1>
                <p className="text-slate-500">
                    Productos que necesitan compra según consumo medio mensual.
                </p>
            </header>

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            Filtros
                        </h2>
                        <p className="text-sm text-slate-500">
                            Filtra por proveedor, familia y nombre de producto.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            Limpiar
                        </button>

                        <button
                            type="button"
                            onClick={fetchStockControl}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                            Actualizar
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <SearchableCombobox
                        label="Proveedor"
                        value={filters.proveedor}
                        options={filterOptions.proveedores}
                        placeholder={loadingFilters ? 'Cargando proveedores...' : 'Todos'}
                        emptyLabel="Todos los proveedores"
                        loading={loadingFilters}
                        onChange={(value) => updateFilter('proveedor', value)}
                    />

                    <SearchableCombobox
                        label="Familia"
                        value={filters.coleccion}
                        options={filterOptions.colecciones}
                        placeholder={loadingFilters ? 'Cargando familias...' : 'Todas'}
                        emptyLabel="Todas las familias"
                        loading={loadingFilters}
                        onChange={(value) => updateFilter('coleccion', value)}
                    />

                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        Nombre producto
                        <input
                            type="search"
                            value={filters.nombreProducto}
                            onChange={(event) => updateFilter('nombreProducto', event.target.value)}
                            placeholder="Buscar producto..."
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        Periodo consumo
                        <select
                            value={filters.mesesConsumo}
                            onChange={(event) => updateFilter('mesesConsumo', event.target.value)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        >
                            {MESES_CONSUMO_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </section>

            {loading && (
                <p className="mb-4 flex items-center justify-center gap-2 text-gray-600">
                    <AiOutlineLoading3Quarters className="animate-spin" />
                    Cargando productos con necesidad de compra...
                </p>
            )}

            {error && (
                <p className="mb-4 text-center text-red-500">
                    Error: {error}
                </p>
            )}

            {!loading && !error && (
                <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="min-w-[260px] px-4 py-3 text-left font-semibold text-slate-700">
                                        Producto
                                    </th>
                                    <th className="w-[180px] max-w-[180px] px-4 py-3 text-left font-semibold text-slate-700">
                                        Proveedor
                                    </th>
                                    <th className="w-[180px] max-w-[180px] px-4 py-3 text-left font-semibold text-slate-700">
                                        Familia
                                    </th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                                        Stock
                                    </th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                                        Pend. recibir
                                    </th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                                        Media mensual
                                    </th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                                        Comprar 1 mes
                                    </th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                                        Comprar 3 meses
                                    </th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                                        Consumo
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100">
                                {products.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan="9"
                                            className="px-4 py-8 text-center text-slate-500"
                                        >
                                            No hay productos que necesiten compra con los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}

                                {products.map((product) => (
                                    <tr
                                        key={product.codprodu}
                                        className="transition hover:bg-blue-50"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">
                                                {product.desprodu || 'Sin descripción'}
                                            </div>
                                            {product.codmarca && (
                                                <div className="text-xs text-slate-500">
                                                    Marca: {product.codmarca}
                                                </div>
                                            )}
                                        </td>

                                        <td className="max-w-[180px] px-4 py-3 text-slate-600">
                                            <div
                                                className="truncate"
                                                title={product.nombre_proveedor || product.codprove || '—'}
                                            >
                                                {product.nombre_proveedor || product.codprove || '—'}
                                            </div>
                                        </td>

                                        <td className="max-w-[180px] px-4 py-3 text-slate-600">
                                            <div
                                                className="truncate"
                                                title={product.nombre_familia || product.codfamilia || '—'}
                                            >
                                                {product.nombre_familia || product.codfamilia || '—'}
                                            </div>
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                                            {formatNumber(product.stockactual)}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                                            {formatNumber(product.canpenrecib)}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                                            {formatNumber(product.avg_monthly_consumption)}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-center">
                                            <span className="inline-flex min-w-20 justify-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                                                {formatNumber(product.recommended_next_month)}
                                            </span>
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-center">
                                            <span className="inline-flex min-w-20 justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
                                                {formatNumber(product.recommended_next_three_months)}
                                            </span>
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openConsumptionModal(product.codprodu)}
                                                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                                            >
                                                Ver gráfica
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <ConsumptionModal
                isOpen={isConsumptionModalOpen}
                product={selectedProduct}
                onClose={closeConsumptionModal}
            />
        </PageShell>
    );
}

function ConsumptionModal({ isOpen, product, onClose }) {
    if (!isOpen) {
        return null;
    }

    const history = Array.isArray(product?.monthly_history) ? product.monthly_history : [];
    const maxConsumption = Math.max(
        ...history.map((item) => Number(item.consumption) || 0),
        0
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Consumo mensual
                        </h2>
                        <p className="text-sm text-slate-500">
                            {product?.codprodu} - {product?.desprodu}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Cerrar modal"
                    >
                        <IoClose size={22} />
                    </button>
                </div>

                <div className="max-h-[75vh] overflow-y-auto p-5">
                    {!product && (
                        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                            No se ha podido cargar el producto seleccionado.
                        </div>
                    )}

                    {product && history.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                            No hay consumo registrado para este producto.
                        </div>
                    )}

                    {product && history.length > 0 && (
                        <div className="overflow-x-auto">
                            <div className="flex min-w-[720px] items-end gap-2 rounded-xl bg-slate-50 p-4">
                                {history.map((item) => {
                                    const consumption = Number(item.consumption) || 0;
                                    const height = maxConsumption > 0
                                        ? Math.max((consumption / maxConsumption) * 220, 8)
                                        : 8;

                                    return (
                                        <div
                                            key={item.label}
                                            className="flex flex-1 flex-col items-center justify-end gap-2"
                                            title={`${item.label}: ${formatNumber(consumption)}`}
                                        >
                                            <div className="text-xs font-semibold text-slate-600">
                                                {formatNumber(consumption)}
                                            </div>

                                            <div
                                                className="w-full max-w-10 rounded-t-lg bg-blue-500"
                                                style={{ height: `${height}px` }}
                                            />

                                            <div className="-rotate-45 whitespace-nowrap text-xs text-slate-500">
                                                {item.label}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LowStockAlertsPage;