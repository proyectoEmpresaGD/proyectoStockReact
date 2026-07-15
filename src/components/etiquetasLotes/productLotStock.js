const toSafeNumber = (value) => {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : 0;
};

export const getCompleteLotStock = (lot = {}) => {
    const stockTotal = toSafeNumber(lot.stocktotal);

    if (
        stockTotal > 0 ||
        Object.prototype.hasOwnProperty.call(lot, 'stocktotal')
    ) {
        return stockTotal;
    }

    return (
        toSafeNumber(lot.stockactual) +
        toSafeNumber(lot.stockreservado)
    );
};