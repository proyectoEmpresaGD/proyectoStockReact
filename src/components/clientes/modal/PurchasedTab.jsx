import React, { useState, useEffect, useCallback } from 'react';
import { FiChevronDown, FiChevronUp, FiSearch } from 'react-icons/fi';
import KPIGrid from './KPIGrid';
import ColumnMenu from './ColumnMenu';

export const ALL_COLUMNS = [
    { key: 'desprodu', label: 'Descripción' },
    { key: 'nfacventa', label: 'Factura' },
    { key: 'nalbventa', label: 'Albarán' },
    { key: 'cantidad', label: 'Cant.' },
    { key: 'precio', label: 'Precio' },
    { key: 'dt1', label: 'Dto%' },
    { key: 'importeDescuento', label: 'Importe' },
    { key: 'stockactual', label: 'Stock' },
    { key: 'fecha', label: 'Fecha' },
];

const FILTERS = ['LIBRO', 'PERCHA', 'QUALITY', 'TELAS'];

export default function PurchasedTab({ client, updateClientBilling }) {
    const token = window.localStorage.getItem('token');
    const [purchased, setPurchased] = useState([]);
    const [stockData, setStockData] = useState([]);
    const [stockFetched, setStockFetched] = useState(false);

    const [yearOptions, setYearOptions] = useState(['All']);
    const [selectedYear, setSelectedYear] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('');
    const [sortOrder, setSortOrder] = useState('newest');
    const [filtered, setFiltered] = useState([]);
    const [totalBilling, setTotalBilling] = useState(0);

    const totalBillingFixed =
        selectedYear === 'All'
            ? purchased.reduce((sum, p) => sum + +p.importeDescuento, 0)
            : purchased
                .filter(
                    (p) =>
                        new Date(p.fecha).getFullYear().toString() ===
                        selectedYear
                )
                .reduce((sum, p) => sum + +p.importeDescuento, 0);

    const yearlyBilling = filtered.reduce(
        (sum, p) => sum + +p.importeDescuento,
        0
    );

    const [visibleCols, setVisibleCols] = useState(
        ALL_COLUMNS.map((c) => c.key)
    );

    useEffect(() => {
        if (!stockFetched) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => r.json())
                .then((data) => {
                    setStockData(data);
                    setStockFetched(true);
                })
                .catch(() => {
                    setStockData([]);
                    setStockFetched(true);
                });
        }
    }, [stockFetched, token]);

    const fetchPurchases = useCallback(async () => {
        if (!client) return;

        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/client-purchases/client/${client.codclien}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!res.ok) {
                setPurchased([]);
                setYearOptions(['All']);
                return;
            }

            const data = await res.json();

            const withDisc = data.map((p) => {
                let imp = +p.importe || 0;

                [p.dt1, p.dt2, p.dt3].forEach((d) => {
                    if (d > 0) imp *= 1 - Math.floor(d) / 100;
                });

                return {
                    ...p,
                    importeDescuento: imp.toFixed(2),
                    dt1: Math.floor(p.dt1 || 0),
                };
            });

            setPurchased(withDisc);

            const yrs = Array.from(
                new Set(withDisc.map((x) => new Date(x.fecha).getFullYear()))
            )
                .sort((a, b) => b - a)
                .map(String);

            setYearOptions(['All', ...yrs]);
        } catch {
            setPurchased([]);
            setYearOptions(['All']);
        }
    }, [client, token]);

    useEffect(() => {
        fetchPurchases();
    }, [fetchPurchases]);

    useEffect(() => {
        if (stockFetched) {
            setPurchased((ps) =>
                ps.map((x) => ({
                    ...x,
                    stockactual:
                        stockData.find((s) => s.codprodu === x.codprodu)
                            ?.stockactual || '0',
                }))
            );
        }
    }, [stockFetched, stockData]);

    useEffect(() => {
        const total = purchased.reduce(
            (s, p) => s + +p.importeDescuento,
            0
        );

        setTotalBilling(total);
        updateClientBilling?.(client.codclien, total);
    }, [purchased, client, updateClientBilling]);

    useEffect(() => {
        let tmp = [...purchased];

        if (selectedYear !== 'All') {
            tmp = tmp.filter(
                (p) =>
                    new Date(p.fecha)
                        .getFullYear()
                        .toString() === selectedYear
            );
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();

            tmp = tmp.filter(
                (p) =>
                    p.desprodu?.toLowerCase().includes(q) ||
                    p.nfacventa?.toString().includes(q) ||
                    p.nalbventa?.toString().includes(q)
            );
        }

        if (selectedFilter) {
            tmp =
                selectedFilter === 'TELAS'
                    ? tmp.filter(
                        (p) =>
                            !['LIBRO', 'PERCHA', 'QUALITY'].some((w) =>
                                p.desprodu?.toUpperCase().includes(w)
                            )
                    )
                    : tmp.filter((p) =>
                        p.desprodu?.toUpperCase().includes(selectedFilter)
                    );
        }

        tmp.sort((a, b) => {
            if (sortOrder === 'newest') {
                return new Date(b.fecha) - new Date(a.fecha);
            }

            if (sortOrder === 'oldest') {
                return new Date(a.fecha) - new Date(b.fecha);
            }

            return b.cantidad - a.cantidad;
        });

        setFiltered(tmp);
    }, [purchased, selectedYear, searchQuery, selectedFilter, sortOrder]);

    const exportToExcel = () => {
        if (!filtered.length) return;

        const rows = [
            [
                'Código',
                'Descripción',
                'Factura',
                'Albarán',
                'Cantidad',
                'Precio',
                'Dto %',
                'Importe €',
                'Fecha',
            ],
            ...filtered.map((p) => [
                p.codprodu ?? '',
                p.desprodu ?? '',
                p.nfacventa ?? '',
                p.nalbventa ?? '',
                p.cantidad ?? '',
                p.precio ?? '',
                p.dt1 ?? '',
                p.importeDescuento ?? '',
                new Date(p.fecha).toLocaleString(),
            ]),
        ];

        const csvContent = rows
            .map((row) =>
                row
                    .map((value) => {
                        const v =
                            value === null || value === undefined
                                ? ''
                                : String(value);

                        const escaped = v.replace(/"/g, '""');

                        return `"${escaped}"`;
                    })
                    .join(';')
            )
            .join('\r\n');

        const blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8;',
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const yearPart = selectedYear || 'All';

        link.href = url;
        link.setAttribute(
            'download',
            `Compras_${client?.codclien ?? 'cliente'}_${yearPart}.csv`
        );

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <KPIGrid
                purchased={filtered}
                totalBilling={totalBillingFixed}
                billingWithFilters={yearlyBilling}
            />

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar en resultados…"
                        className="w-full border rounded-lg px-3 py-2 text-sm pr-10"
                    />
                    <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>

                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                >
                    {yearOptions.map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>

                {FILTERS.map((f) => (
                    <button
                        key={f}
                        onClick={() =>
                            setSelectedFilter((s) => (s === f ? '' : f))
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedFilter === f
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                    >
                        {f}
                    </button>
                ))}

                <button
                    onClick={() =>
                        setSortOrder((o) =>
                            o === 'newest' ? 'oldest' : 'newest'
                        )
                    }
                    className="flex items-center gap-1 px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm ml-auto"
                >
                    {sortOrder === 'newest' ? 'Recientes' : 'Antiguas'}
                    {sortOrder === 'newest' ? (
                        <FiChevronDown />
                    ) : (
                        <FiChevronUp />
                    )}
                </button>

                <button
                    onClick={exportToExcel}
                    className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
                >
                    Exportar Excel
                </button>

                <ColumnMenu
                    allColumns={ALL_COLUMNS}
                    visibleCols={visibleCols}
                    setVisibleCols={setVisibleCols}
                />
            </div>

            <div className="overflow-auto" style={{ maxHeight: '50vh' }}>
                <table className="min-w-full text-sm bg-white">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            {ALL_COLUMNS.filter((c) =>
                                visibleCols.includes(c.key)
                            ).map((c) => (
                                <th
                                    key={c.key}
                                    className="px-3 py-2 text-left"
                                >
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {filtered.length > 0 ? (
                            filtered.map((p, idx) => (
                                <tr
                                    key={idx}
                                    className="border-b hover:bg-gray-50"
                                >
                                    {visibleCols.includes('desprodu') && (
                                        <td className="px-3 py-2">
                                            {p.desprodu}
                                        </td>
                                    )}

                                    {visibleCols.includes('nfacventa') && (
                                        <td className="px-3 py-2">
                                            {p.codserfacventa
                                                ? `${p.codserfacventa}-${p.nfacventa}`
                                                : p.nfacventa}
                                        </td>
                                    )}

                                    {visibleCols.includes('nalbventa') && (
                                        <td className="px-3 py-2">
                                            {p.codseralbventa
                                                ? `${p.codseralbventa}-${p.nalbventa}`
                                                : p.nalbventa}
                                        </td>
                                    )}

                                    {visibleCols.includes('cantidad') && (
                                        <td className="px-3 py-2">
                                            {p.cantidad}
                                        </td>
                                    )}

                                    {visibleCols.includes('precio') && (
                                        <td className="px-3 py-2">
                                            {p.precio}
                                        </td>
                                    )}

                                    {visibleCols.includes('dt1') && (
                                        <td className="px-3 py-2">
                                            {p.dt1 > 0 ? (
                                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                                                    {p.dt1}%
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    )}

                                    {visibleCols.includes(
                                        'importeDescuento'
                                    ) && (
                                            <td className="px-3 py-2">
                                                {p.importeDescuento}
                                            </td>
                                        )}

                                    {visibleCols.includes('stockactual') && (
                                        <td className="px-3 py-2">
                                            {(Number(p.stockactual) || 0).toFixed(2) < 10 ? (
                                                <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                                    {(Number(p.stockactual) || 0).toFixed(2)}
                                                </span>
                                            ) : (
                                                Number(p.stockactual).toFixed(2)
                                            )}
                                        </td>
                                    )}

                                    {visibleCols.includes('fecha') && (
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(
                                                p.fecha
                                            ).toLocaleDateString()}
                                        </td>
                                    )}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={visibleCols.length}
                                    className="px-3 py-4 text-center text-gray-500"
                                >
                                    No hay productos disponibles.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}