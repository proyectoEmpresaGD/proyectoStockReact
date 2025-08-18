// src/components/productos/ProductTable.jsx
import React, { useState } from 'react';

const ProductTable = ({ products, handleProductClick }) => {
    const [vista, setVista] = useState('tabla');

    const headers = [
        { key: 'codprodu', label: 'Código' },
        { key: 'desprodu', label: 'Descripción' },
        { key: 'stockactual', label: 'Stock Actual' },
        { key: 'canpenrecib', label: 'Pendiente Recibir' },
        { key: 'canpenservir', label: 'Pendiente Servir' },
    ];

    const safeValue = val => {
        const num = parseFloat(val);
        if (val === null || val === undefined || val === '' || isNaN(num)) return '—';
        return num.toFixed(2);
    };

    return (
        <div className="w-full relative">
            {/* Botón de alternancia */}
            <div className="flex justify-end mb-2">
                <button
                    onClick={() => setVista(v => (v === 'tabla' ? 'tarjeta' : 'tabla'))}
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
                            {headers.map(h => (
                                <div key={h.key} className="flex justify-between mb-1 last:mb-0">
                                    <span className="font-medium text-gray-600">{h.label}:</span>
                                    <span className="text-gray-800">
                                        {['stockactual', 'canpenrecib', 'canpenservir'].includes(h.key)
                                            ? safeValue(p[h.key])
                                            : p[h.key] || '—'}
                                    </span>
                                </div>
                            ))}
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
                            {headers.map(h => (
                                <th
                                    key={h.key}
                                    className={`py-3 px-2 text-left font-medium text-gray-700 uppercase tracking-wide ${h.key === 'desprodu' ? 'w-2/6' : 'w-1/6'
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
                                <tr
                                    key={p.codprodu}
                                    onClick={() => handleProductClick(p)}
                                    className={`cursor-pointer border-b transition-colors duration-150 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                        } hover:bg-blue-50`}
                                    tabIndex={0}
                                >
                                    <td className="py-2 px-2 font-semibold whitespace-nowrap text-gray-800">
                                        {p.codprodu || '—'}
                                    </td>
                                    <td className="py-2 px-2 text-gray-800">{p.desprodu || '—'}</td>
                                    <td className="py-2 px-2 text-center text-gray-800">{safeValue(p.stockactual)}</td>
                                    <td className="py-2 px-2 text-center text-gray-800">{safeValue(p.canpenrecib)}</td>
                                    <td className="py-2 px-2 text-center text-gray-800">{safeValue(p.canpenservir)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-gray-500 italic">
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
