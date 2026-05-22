const formatNumber = (value) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '0';
    return numberValue.toLocaleString('es-ES', { maximumFractionDigits: 2 });
};

function StockConsumptionChart({ product }) {
    const history = Array.isArray(product?.monthly_history) ? product.monthly_history : [];
    const maxValue = Math.max(...history.map((item) => Number(item.consumption) || 0), 0);

    if (!product) {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
                Selecciona un producto para ver la gráfica de consumo.
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-slate-900">
                    Consumo mensual: {product.codprodu}
                </h2>
                <p className="text-sm text-slate-500">{product.desprodu}</p>
            </div>

            {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    No hay consumo registrado para este producto en el periodo seleccionado.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <div className="flex min-w-[720px] items-end gap-2 rounded-xl bg-slate-50 p-4">
                        {history.map((item) => {
                            const consumption = Number(item.consumption) || 0;
                            const height = maxValue > 0 ? Math.max((consumption / maxValue) * 180, 6) : 6;

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
        </section>
    );
}

export default StockConsumptionChart;