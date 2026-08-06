export const STOCK_STATUS = {
    immediate: 'immediate',
    upcoming: 'upcoming',
    covered: 'covered',
    missingSupplier: 'missingSupplier',
    all: 'all',
};

export const HORIZONS = {
    month: 'month',
    quarter: 'quarter',
};

export const toNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export const formatQuantity = (value, decimals = 2) => {
    return toNumber(value).toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

export const formatCoverage = (value) => {
    const months = toNumber(value);

    if (months <= 0) return 'Sin cobertura';
    if (months >= 99) return 'Sin consumo';
    if (months < 1) return `${Math.max(Math.round(months * 30), 1)} días`;

    return `${months.toLocaleString('es-ES', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })} meses`;
};

export const getNetRecommendation = (product, horizon = HORIZONS.month) => {
    if (horizon === HORIZONS.quarter) {
        return toNumber(
            product?.recommended_net_next_three_months
            ?? product?.recommended_next_three_months
        );
    }

    return toNumber(
        product?.recommended_net_next_month
        ?? product?.recommended_next_month
    );
};

export const getSuggestedOrder = (product, horizon = HORIZONS.month) => {
    if (horizon === HORIZONS.quarter) {
        return toNumber(
            product?.suggested_order_next_three_months
            ?? getNetRecommendation(product, horizon)
        );
    }

    return toNumber(
        product?.suggested_order_next_month
        ?? getNetRecommendation(product, horizon)
    );
};

export const getStockStatus = (product) => {
    const oneMonthNeed = getNetRecommendation(product, HORIZONS.month);
    const threeMonthNeed = getNetRecommendation(product, HORIZONS.quarter);

    if (oneMonthNeed > 0) return STOCK_STATUS.immediate;
    if (threeMonthNeed > 0) return STOCK_STATUS.upcoming;
    return STOCK_STATUS.covered;
};

export const getStatusMeta = (status) => {
    switch (status) {
        case STOCK_STATUS.immediate:
            return {
                label: 'Comprar ahora',
                description: 'La posición prevista no cubre un mes de consumo.',
                badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
                cardClass: 'border-rose-200 bg-rose-50/40',
            };
        case STOCK_STATUS.upcoming:
            return {
                label: 'Planificar',
                description: 'Cubre el corto plazo, pero no los próximos tres meses.',
                badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
                cardClass: 'border-amber-200 bg-amber-50/40',
            };
        case STOCK_STATUS.covered:
        default:
            return {
                label: 'Cubierto',
                description: 'El stock y las entradas previstas cubren tres meses.',
                badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                cardClass: 'border-emerald-200 bg-emerald-50/40',
            };
    }
};

export const getRiskByLeadTime = (product) => {
    const leadDays = toNumber(product?.lead_time_days, 0);
    const coverageMonths = toNumber(product?.projected_coverage_months, 0);

    if (leadDays <= 0 || getNetRecommendation(product, HORIZONS.quarter) <= 0) {
        return null;
    }

    const coverageDays = coverageMonths * 30;
    if (coverageDays >= leadDays) return null;

    return {
        label: 'Riesgo por plazo',
        description: `La cobertura prevista (${formatCoverage(coverageMonths)}) es menor que el plazo de entrega (${Math.round(leadDays)} días).`,
    };
};

export const compareStockRows = (sortBy, horizon) => (a, b) => {
    switch (sortBy) {
        case 'supplier':
            return String(a.nombre_proveedor || a.codprove || '')
                .localeCompare(String(b.nombre_proveedor || b.codprove || ''), 'es', { sensitivity: 'base' });
        case 'product':
            return String(a.desprodu || a.codprodu || '')
                .localeCompare(String(b.desprodu || b.codprodu || ''), 'es', { sensitivity: 'base' });
        case 'coverage':
            return toNumber(a.projected_coverage_months, 999) - toNumber(b.projected_coverage_months, 999);
        case 'quantity':
            return getSuggestedOrder(b, horizon) - getSuggestedOrder(a, horizon);
        case 'priority':
        default: {
            const priority = {
                [STOCK_STATUS.immediate]: 0,
                [STOCK_STATUS.upcoming]: 1,
                [STOCK_STATUS.covered]: 2,
            };
            const statusDiff = priority[getStockStatus(a)] - priority[getStockStatus(b)];
            if (statusDiff !== 0) return statusDiff;

            return getSuggestedOrder(b, horizon) - getSuggestedOrder(a, horizon);
        }
    }
};

export const buildPurchasePlanItem = (product, horizon) => ({
    codprodu: product.codprodu,
    desprodu: product.desprodu || '',
    codprove: product.codprove || '',
    nombre_proveedor: product.nombre_proveedor || product.codprove || '',
    codfamilia: product.codfamilia || '',
    nombre_familia: product.nombre_familia || '',
    stockactual: toNumber(product.stockactual),
    canpenservir: toNumber(product.canpenservir),
    canpenrecib: toNumber(product.canpenrecib),
    stock_projected: toNumber(product.stock_projected),
    avg_monthly_consumption: toNumber(product.avg_monthly_consumption),
    minimum_order_quantity: toNumber(product.minimum_order_quantity),
    lead_time_days: toNumber(product.lead_time_days),
    estimated_receipt_date: product.estimated_receipt_date || null,
    horizon,
    recommended: getNetRecommendation(product, horizon),
    quantity: getSuggestedOrder(product, horizon),
    notes: '',
});
