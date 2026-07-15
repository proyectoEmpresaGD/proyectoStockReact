export const LOT_LABEL_SCAN_MODES = {
    productEnterLotEnter: 'productEnterLotEnter',
    productEnterLot: 'productEnterLot',
    productTabLotEnter: 'productTabLotEnter',
    productPipeLot: 'productPipeLot',
};

export const LOT_LABEL_SCAN_MODE_OPTIONS = [
    {
        value: LOT_LABEL_SCAN_MODES.productEnterLotEnter,
        label: 'Producto + Enter + Lote + Enter',
        description: 'Recomendado para lector Bluetooth en modo teclado.',
    },
    {
        value: LOT_LABEL_SCAN_MODES.productEnterLot,
        label: 'Producto + Enter + Lote',
        description: 'Útil si el lector ya añade Enter al final.',
    },
    {
        value: LOT_LABEL_SCAN_MODES.productTabLotEnter,
        label: 'Producto + Tab + Lote + Enter',
        description: 'Útil si la app externa cambia de campo con tabulador.',
    },
    {
        value: LOT_LABEL_SCAN_MODES.productPipeLot,
        label: 'Producto | Lote',
        description: 'Solo informativo. No simula dos lecturas.',
    },
];

export const LOT_LABEL_PRINT_MODES = {
    sheet: 'sheet',
    singleLabel: 'singleLabel',
};

export const LOT_LABEL_PRINT_MODE_OPTIONS = [
    {
        value: LOT_LABEL_PRINT_MODES.sheet,
        label: 'Hoja A4',
    },
    {
        value: LOT_LABEL_PRINT_MODES.singleLabel,
        label: 'Etiqueta individual',
    },
];

export const DEFAULT_LOT_LABEL_CONFIG = {
    scanMode: LOT_LABEL_SCAN_MODES.productEnterLotEnter,
    printMode: LOT_LABEL_PRINT_MODES.singleLabel,
    onlyAvailableStock: true,
    copiesPerLot: 1,
    labelWidthCm: 15,
    labelHeightCm: 10,
};