import { LOT_LABEL_SCAN_MODES } from './productLotLabelConstants';

const normalizeText = (value) => String(value || '').trim();

const LOT_PREFIX_DELAY_CHARACTER = ' ';

export const buildLotQrValue = ({ codprodu, codlote, scanMode }) => {
    const productCode = normalizeText(codprodu);
    const lotCode = normalizeText(codlote);

    if (!productCode || !lotCode) return '';

    if (scanMode === LOT_LABEL_SCAN_MODES.productEnterLot) {
        return `${productCode}\r${LOT_PREFIX_DELAY_CHARACTER}${lotCode}`;
    }

    if (scanMode === LOT_LABEL_SCAN_MODES.productTabLotEnter) {
        return `${productCode}\t${LOT_PREFIX_DELAY_CHARACTER}${lotCode}\r`;
    }

    if (scanMode === LOT_LABEL_SCAN_MODES.productPipeLot) {
        return `${productCode}|${lotCode}`;
    }

    return `${productCode}\r${LOT_PREFIX_DELAY_CHARACTER}${lotCode}\r`;
};