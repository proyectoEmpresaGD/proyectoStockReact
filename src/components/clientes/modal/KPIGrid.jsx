import React from 'react';

export default function KPIGrid({ purchased, totalBilling, billingWithFilters }) {
    const uniqueProducts = new Set(purchased.map(p => p.codprodu)).size;
    const avg = (totalBilling / (purchased.length || 1)).toFixed(2);
    const facturacionTotal = totalBilling;

    const items = [
        // ['Total Líneas', purchased.length],
        // ['Únicos', uniqueProducts],
        ['Total global (sin filtros)', totalBilling.toFixed(2)],
        ['Total con filtros', billingWithFilters.toFixed(2)],
        // ['Importe Medio', avg],
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-4">
            {items.map(([label, value]) => (
                <div
                    key={label}
                    className="bg-gray-50 p-4 rounded-lg shadow-sm text-center"
                >
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
            ))}
        </div>
    );
}
