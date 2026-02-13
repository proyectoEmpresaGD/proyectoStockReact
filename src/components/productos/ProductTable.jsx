// src/components/productos/ProductTable.jsx
import React, { useState } from 'react';

const ProductTable = ({ products, handleProductClick }) => {
    const [vista, setVista] = useState('tabla');

    const headers = [
        { key: 'codprodu', label: 'Código' },
        { key: 'desprodu', label: 'Descripción' },
        { key: 'stockactual', label: 'Stock Actual' },
        { key: 'canpenrecib', label: 'Pendiente Recibir' },
        { key: 'fechaestimada', label: 'Fecha Estimada' },
        { key: 'canpenservir', label: 'Pendiente Servir' },
    ];

    const safeValue = (val) => {
        const num = parseFloat(val);
        if (val === null || val === undefined || val === '' || Number.isNaN(num)) return '—';
        return num.toFixed(2);
    };

    const safeDays = (val) => {
        const n = parseInt(val, 10);
        if (val === null || val === undefined || val === '' || Number.isNaN(n)) return '—';
        return n;
    };

    const formatDate = (value) => {
        if (!value) return '—';
        const asDate = new Date(value);
        if (!Number.isNaN(asDate.getTime())) {
            return asDate.toLocaleDateString('es-ES');
        }
        return String(value);
    };

    // Suma N días (p.plaentre) a la fecha de hoy y devuelve la fecha en formato es-ES
    const formatFutureDateFromDays = (days) => {
        const n = parseInt(days, 10);
        if (days === null || days === undefined || days === '' || Number.isNaN(n)) return '—';

        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + n);

        return d.toLocaleDateString('es-ES');
    };

    const renderNoStockMessage = (p) => {
        const dias = safeDays(p.plaentre);
        const fechaEntrega = formatFutureDateFromDays(p.plaentre);

        return (
            <div className="mt-2 text-base text-gray-700">
                En caso de no haber stock disponible podemos entregar:{' '}
                <strong>{safeValue(p.cantminima)}</strong>{' '}
                en un plazo de: <strong>{dias} días</strong>
                {' · '}
                Lo tendría disponible en la fecha: <strong>{fechaEntrega}</strong>.{' '}
                Para cantidades superiores, consultar en <strong>pedidos@cjmgroup.es</strong>.
            </div>
        );
    };

    return (
        <div className="w-full relative">
            {/* Botón de alternancia */}
            <div className="flex justify-end mb-2">
                <button
                    onClick={() => setVista((v) => (v === 'tabla' ? 'tarjeta' : 'tabla'))}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded text-sm transition"
                >
                    Vista: {vista}
                </button>
            </div>

            {/* Vista tarjetas (mobile y también en escritorio si se activa) */}
            <div
                className={`
                    space-y-4 overflow-y-auto max-h-[50vh] p-2 transition-all duration-500 ease-in-out
                    ${vista === 'tarjeta' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none h-0'}
                `}
            >
                {products.length > 0 ? (
                    products.map((p) => (
                        <div
                            key={p.codprodu}
                            onClick={() => handleProductClick(p)}
                            className="p-4 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer bg-white"
                        >
                            {headers.map((h) => (
                                <div key={h.key} className="flex justify-between mb-1 last:mb-0">
                                    <span className="font-medium text-gray-600">{h.label}:</span>
                                    <span className="text-gray-800">
                                        {['stockactual', 'canpenrecib', 'canpenservir'].includes(h.key)
                                            ? safeValue(p[h.key])
                                            : h.key === 'fechaestimada'
                                                ? formatDate(p[h.key])
                                                : p[h.key] || '—'}
                                    </span>
                                </div>
                            ))}
                            {renderNoStockMessage(p)}
                        </div>
                    ))
                ) : (
                    <div className="p-6 border border-gray-200 rounded-lg text-center text-gray-500 italic bg-white">
                        No hay productos para mostrar.
                    </div>
                )}
            </div>

            {/* Vista tabla (desktop) */}
            <div
                className={`
                    transition-all duration-500 ease-in-out
                    ${vista === 'tarjeta' ? 'opacity-0 scale-95 pointer-events-none h-0' : 'opacity-100 scale-100'}
                    md:block overflow-x-auto shadow-lg rounded-lg border border-gray-200 bg-white max-h-[60vh]
                `}
            >
                <table className="min-w-max w-full text-sm lg:text-base">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            {headers.map((h) => (
                                <th
                                    key={h.key}
                                    className={`py-3 px-2 text-left font-medium text-gray-700 uppercase tracking-wide ${h.key === 'desprodu' ? 'w-2/6' : ''
                                        }`}
                                >
                                    {h.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {products.length > 0 ? (
                            products.map((p, i) => (
                                <React.Fragment key={p.codprodu}>
                                    <tr
                                        onClick={() => handleProductClick(p)}
                                        className={`cursor-pointer border-b transition-colors duration-150 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                            } hover:bg-blue-50`}
                                        tabIndex={0}
                                    >
                                        <td className="py-2 px-2 font-semibold whitespace-nowrap text-gray-800">
                                            {p.codprodu || '—'}
                                        </td>
                                        <td className="py-2 px-2 text-gray-800">{p.desprodu || '—'}</td>
                                        <td className="py-2 px-2 text-center text-gray-800">
                                            {safeValue(p.stockactual)}
                                        </td>
                                        <td className="py-2 px-2 text-center text-gray-800">
                                            {safeValue(p.canpenrecib)}
                                        </td>
                                        <td className="py-2 px-2 text-center text-gray-800">
                                            {formatDate(p.fechaestimada)}
                                        </td>
                                        <td className="py-2 px-2 text-center text-gray-800">
                                            {safeValue(p.canpenservir)}
                                        </td>
                                    </tr>

                                    {/* Fila extra actualizada */}
                                    <tr className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td colSpan={6} className="px-2 pb-3 pt-0 text-sm text-gray-700">
                                            En caso de no haber stock disponible podemos entregar:{' '}
                                            <strong>{safeValue(p.cantminima)}</strong>{' '}
                                            en un plazo de: <strong>{safeDays(p.plaentre)} días</strong>
                                            {' · '}
                                            Lo tendría disponible en la fecha:{' '}
                                            <strong>{formatFutureDateFromDays(p.plaentre)}</strong>.{' '}
                                            Para cantidades superiores, consultar en{' '}
                                            <strong>pedidos@cjmgroup.es</strong>.
                                        </td>
                                    </tr>
                                </React.Fragment>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-gray-500 italic">
                                    No hay productos para mostrar.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductTable;
