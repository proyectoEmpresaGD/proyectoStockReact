const formatNumber = (value) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '0,00';
    return numberValue.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const RecommendationBadge = ({ value }) => {
    const numberValue = Number(value) || 0;
    const className = numberValue > 0
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200';

    return (
        <span className={`inline-flex min-w-20 justify-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${className}`}>
            {formatNumber(numberValue)}
        </span>
    );
};

function StockControlTable({ rows, selectedProductCode, onSelectProduct }) {
    if (!rows.length) {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                No hay productos que coincidan con los filtros seleccionados.
            </section>
        );
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Código</th>
                            <th className="min-w-[260px] px-4 py-3 text-left font-semibold text-slate-700">Producto</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Proveedor</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Colección</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-700">Stock</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-700">Pend. recibir</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-700">Media mensual</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Comprar 1 mes</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Comprar 3 meses</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => {
                            const isSelected = row.codprodu === selectedProductCode;

                            return (
                                <tr
                                    key={row.codprodu}
                                    onClick={() => onSelectProduct(row.codprodu)}
                                    className={`cursor-pointer transition hover:bg-blue-50 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
                                >
                                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                                        {row.codprodu}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        <div className="font-medium text-slate-900">{row.desprodu || 'Sin descripción'}</div>
                                        <div className="text-xs text-slate-500">{row.codmarca || 'Sin marca'}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                        {row.codprove || '—'}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                        {row.coleccion || '—'}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                                        {formatNumber(row.stockactual)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                                        {formatNumber(row.canpenrecib)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                                        {formatNumber(row.avg_monthly_consumption)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-center">
                                        <RecommendationBadge value={row.recommended_next_month} />
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-center">
                                        <RecommendationBadge value={row.recommended_next_three_months} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default StockControlTable;