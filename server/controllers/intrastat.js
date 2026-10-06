import XLSX from 'xlsx-js-style';
import { IntrastatModel } from '../models/Postgres/intrastat.js';

export class IntrastatController {

    normalize(value) {
        if (!value) return '';
        return String(value).trim();
    }

    getColumnKey(rows, target) {
        return Object.keys(rows[0]).find(k =>
            k.trim().toUpperCase() === target.toUpperCase()
        );
    }
    getVentasOutputHeaders() {
        return [
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
            'CONDICIONES DE ENTREGA',
            'DESCRIPCION_MERCANCIA',
            'CODIGO DE LAS MERCANCÍAS ',
            'UNIDADES SUPLEMENTARIAS',
            'MODALIDAD DE TRANSPORTE (N1)',
            'PAIS DE ORIGEN (A2)',
            'MASA NETA EN KG',
            'IMPORTE FACTURADO',
            'NIF VIES',
            'FACTURA',
            'IMPORTE FACTURA',
            'PORTES',
            'KM_ESPANA',
            'KM_FRONTERA',
            'FACTURA ABONO',
            'AJUSTE_REDONDEO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ];
    }

    parseExcelNumber(value) {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return '';
        }

        if (
            typeof value === 'number'
        ) {
            return Number.isFinite(value)
                ? value
                : '';
        }

        let normalizedValue =
            String(value)
                .trim()
                .replace(/\s+/g, '');

        if (!normalizedValue) {
            return '';
        }

        const hasComma =
            normalizedValue.includes(',');

        const hasPoint =
            normalizedValue.includes('.');

        if (
            hasComma &&
            hasPoint
        ) {
            const lastCommaIndex =
                normalizedValue.lastIndexOf(',');

            const lastPointIndex =
                normalizedValue.lastIndexOf('.');

            if (
                lastCommaIndex >
                lastPointIndex
            ) {
                normalizedValue =
                    normalizedValue
                        .replace(/\./g, '')
                        .replace(',', '.');
            } else {
                normalizedValue =
                    normalizedValue
                        .replace(/,/g, '');
            }
        } else if (hasComma) {
            normalizedValue =
                normalizedValue
                    .replace(',', '.');
        }

        const numberValue =
            parseFloat(
                normalizedValue
            );

        return Number.isFinite(
            numberValue
        )
            ? numberValue
            : '';
    }

    getVentasZebraFillColor() {
        return 'D6D6D6';
    }

    normalizeFacturaForSort(factura) {
        return String(factura || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');
    }

    splitFacturaForSort(factura) {
        const normalizedFactura =
            this.normalizeFacturaForSort(factura);

        const match =
            normalizedFactura.match(
                /^([A-ZÀ-ÿ-]*?)(\d+)$/
            );

        if (!match) {
            return {
                serie: normalizedFactura,
                numero: 0,
                raw: normalizedFactura,
            };
        }

        return {
            serie: match[1],
            numero: Number(match[2]),
            raw: normalizedFactura,
        };
    }

    sortRowsByFactura(rows) {
        return [...rows].sort((a, b) => {
            const facturaA =
                this.splitFacturaForSort(
                    a.FACTURA
                );

            const facturaB =
                this.splitFacturaForSort(
                    b.FACTURA
                );

            const serieCompare =
                facturaA.serie.localeCompare(
                    facturaB.serie,
                    'es',
                    {
                        sensitivity: 'base',
                    }
                );

            if (serieCompare !== 0) {
                return serieCompare;
            }

            if (
                facturaA.numero !==
                facturaB.numero
            ) {
                return (
                    facturaA.numero -
                    facturaB.numero
                );
            }

            return facturaA.raw.localeCompare(
                facturaB.raw,
                'es',
                {
                    sensitivity: 'base',
                    numeric: true,
                }
            );
        });
    }

    applyVentasReferenceExcelStyle(
        sheet,
        rows,
        headers
    ) {
        if (!sheet['!ref']) {
            return;
        }

        const range =
            XLSX.utils.decode_range(
                sheet['!ref']
            );

        const coloredHeaders = new Set([
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
            'CONDICIONES DE ENTREGA',
            'DESCRIPCION_MERCANCIA',
            'CODIGO DE LAS MERCANCÍAS ',
            'UNIDADES SUPLEMENTARIAS',
            'MODALIDAD DE TRANSPORTE (N1)',
            'PAIS DE ORIGEN (A2)',
            'MASA NETA EN KG',
            'KM_ESPANA',
            'KM_FRONTERA',
        ]);

        const boldCenteredColumns =
            new Set([
                'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
                'CONDICIONES DE ENTREGA',
                'DESCRIPCION_MERCANCIA',
                'CODIGO DE LAS MERCANCÍAS ',
                'UNIDADES SUPLEMENTARIAS',
                'MODALIDAD DE TRANSPORTE (N1)',
                'PAIS DE ORIGEN (A2)',
                'MASA NETA EN KG',
                'IMPORTE FACTURA',
                'KM_ESPANA',
                'KM_FRONTERA',
            ]);

        const numberFormatByHeader = {
            'UNIDADES SUPLEMENTARIAS':
                '#,##0.00',

            'MASA NETA EN KG':
                '#,##0.00',

            PORTES:
                '#,##0.00',
        };

        const orangeFill = {
            patternType: 'solid',

            fgColor: {
                rgb: 'FDEADA',
            },
        };

        headers.forEach(
            (header, colIndex) => {
                const shouldColorHeader =
                    coloredHeaders.has(header);

                const shouldBoldAndCenter =
                    boldCenteredColumns.has(
                        header
                    );

                const numberFormat =
                    numberFormatByHeader[
                    header
                    ];

                for (
                    let rowIndex =
                        range.s.r;

                    rowIndex <=
                    range.e.r;

                    rowIndex += 1
                ) {
                    const cellAddress =
                        XLSX.utils
                            .encode_cell({
                                r: rowIndex,
                                c: colIndex,
                            });

                    if (
                        !sheet[cellAddress]
                    ) {
                        sheet[
                            cellAddress
                        ] = {
                            t: 's',
                            v: '',
                        };
                    }

                    const isHeaderRow =
                        rowIndex === 0;

                    sheet[
                        cellAddress
                    ].s = {
                        ...(
                            sheet[
                                cellAddress
                            ].s || {}
                        ),

                        font: {
                            ...(
                                sheet[
                                    cellAddress
                                ].s?.font ||
                                {}
                            ),

                            name:
                                'Calibri',

                            sz:
                                11,

                            bold:
                                isHeaderRow ||
                                shouldBoldAndCenter,
                        },

                        alignment: {
                            ...(
                                sheet[
                                    cellAddress
                                ].s
                                    ?.alignment ||
                                {}
                            ),

                            horizontal:
                                isHeaderRow ||
                                    shouldBoldAndCenter
                                    ? 'center'
                                    : sheet[
                                        cellAddress
                                    ].s
                                        ?.alignment
                                        ?.horizontal,

                            vertical:
                                'center',

                            wrapText:
                                isHeaderRow,
                        },

                        ...(
                            isHeaderRow &&
                                shouldColorHeader
                                ? {
                                    fill:
                                        orangeFill,
                                }
                                : {}
                        ),

                        ...(
                            numberFormat &&
                                !isHeaderRow
                                ? {
                                    numFmt:
                                        numberFormat,
                                }
                                : {}
                        ),
                    };
                }
            }
        );

        if (!sheet['!cols']) {
            sheet['!cols'] = [];
        }

        headers.forEach(
            (header, colIndex) => {
                if (
                    header ===
                    'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                ) {
                    sheet['!cols'][
                        colIndex
                    ] = {
                        wch: 20,
                    };

                    return;
                }

                if (
                    header ===
                    'DESCRIPCION_MERCANCIA'
                ) {
                    sheet['!cols'][
                        colIndex
                    ] = {
                        wch: 28,
                    };

                    return;
                }

                if (
                    header ===
                    'CODIGO DE LAS MERCANCÍAS '
                ) {
                    sheet['!cols'][
                        colIndex
                    ] = {
                        wch: 18,
                    };

                    return;
                }

                if (
                    header ===
                    'MODALIDAD DE TRANSPORTE (N1)'
                ) {
                    sheet['!cols'][
                        colIndex
                    ] = {
                        wch: 20,
                    };

                    return;
                }

                sheet['!cols'][
                    colIndex
                ] = {
                    wch: 14,
                };
            }
        );

        if (!sheet['!rows']) {
            sheet['!rows'] = [];
        }

        sheet['!rows'][0] = {
            hpt: 45,
        };
    }

    formatVentasOutputRows(rows) {
        return rows.map(row => ({
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                row[
                'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                ] ?? '',

            'CONDICIONES DE ENTREGA':
                row.INCOTERMS ?? '',

            DESCRIPCION_MERCANCIA:
                row.DESCRIPCION_MERCANCIA ?? '',

            'CODIGO DE LAS MERCANCÍAS ':
                row[
                'CODIGO DE LAS MERCANCÍAS '
                ] ?? '',

            'UNIDADES SUPLEMENTARIAS':
                this.parseExcelNumber(
                    row[
                    'UNIDADES SUPLEMENTARIAS'
                    ]
                ),

            'MODALIDAD DE TRANSPORTE (N1)':
                row[
                'Modo de transporte'
                ] ?? '',

            'PAIS DE ORIGEN (A2)':
                row[
                'PAIS DE ORIGEN (A2)'
                ] ?? '',

            'MASA NETA EN KG':
                this.parseExcelNumber(
                    row[
                    'MASA NETA EN KG'
                    ]
                ),

            /*
             * Se conserva EXACTAMENTE
             * como venía del Excel.
             */
            'IMPORTE FACTURADO':
                row.__ORIGINAL_EXCEL__ === true
                    ? row.__IMPORTE_FACTURADO_ORIGINAL__
                    : (
                        row[
                        'IMPORTE FACTURADO'
                        ] ?? ''
                    ),

            'NIF VIES':
                row[
                'NIF VIES'
                ] ?? '',

            FACTURA:
                row.FACTURA ?? '',

            /*
             * También se conserva el original.
             */
            'IMPORTE FACTURA':
                row.__ORIGINAL_EXCEL__ === true
                    ? row.__IMPORTE_FACTURA_ORIGINAL__
                    : (
                        row[
                        'IMPORTE FACTURA'
                        ] ?? ''
                    ),

            PORTES:
                this.parseExcelNumber(
                    row.PORTES
                ),

            KM_ESPANA:
                this.parseExcelNumber(
                    row.KM_ESPANA
                ),

            KM_FRONTERA:
                this.parseExcelNumber(
                    row.KM_FRONTERA
                ),

            'FACTURA ABONO':
                row[
                'FACTURA ABONO'
                ] ?? '',

            AJUSTE_REDONDEO:
                row.AJUSTE_REDONDEO ?? '',

            AGREGADA_POR_FACTURA_MES:
                row
                    .AGREGADA_POR_FACTURA_MES ?? '',

            ERROR_FACTURA:
                row.ERROR_FACTURA ?? '',
        }));
    }

    applyVentasFacturaZebraStyle(
        sheet,
        rows,
        headers
    ) {
        if (!sheet['!ref']) {
            return;
        }

        const range =
            XLSX.utils.decode_range(
                sheet['!ref']
            );

        const facturaHeader =
            'FACTURA';

        if (
            !headers.includes(
                facturaHeader
            )
        ) {
            return;
        }

        let previousFactura =
            null;

        let currentBlockIndex =
            -1;

        for (
            let rowIndex = 1;
            rowIndex <= range.e.r;
            rowIndex += 1
        ) {
            const dataRowIndex =
                rowIndex - 1;

            const row =
                rows[dataRowIndex];

            if (!row) {
                continue;
            }

            const factura =
                String(
                    row[
                    facturaHeader
                    ] || ''
                )
                    .trim()
                    .toUpperCase()
                    .replace(
                        /\s+/g,
                        ''
                    );

            if (!factura) {
                continue;
            }

            if (
                factura !==
                previousFactura
            ) {
                previousFactura =
                    factura;

                currentBlockIndex +=
                    1;
            }

            const shouldApplyGrey =
                currentBlockIndex %
                2 !==
                0;

            if (
                !shouldApplyGrey
            ) {
                continue;
            }

            for (
                let colIndex =
                    range.s.c;

                colIndex <=
                range.e.c;

                colIndex += 1
            ) {
                const cellAddress =
                    XLSX.utils
                        .encode_cell({
                            r:
                                rowIndex,

                            c:
                                colIndex,
                        });

                if (
                    !sheet[
                    cellAddress
                    ]
                ) {
                    sheet[
                        cellAddress
                    ] = {
                        t: 's',
                        v: '',
                    };
                }

                sheet[
                    cellAddress
                ].s = {
                    ...(
                        sheet[
                            cellAddress
                        ].s || {}
                    ),

                    fill: {
                        patternType:
                            'solid',

                        fgColor: {
                            rgb:
                                this
                                    .getVentasZebraFillColor(),
                        },
                    },
                };
            }
        }
    }

    parseFactura(factura) {
        if (!factura) {
            return null;
        }

        const [
            serie,
            numero,
        ] =
            String(factura)
                .split('-');

        return {
            codserfacventa:
                serie?.trim(),

            nfacventa:
                numero?.trim(),
        };
    }

    isFacturaAbonoVentas(factura) {
        const normalized =
            String(
                factura || ''
            )
                .trim()
                .toUpperCase()
                .replace(
                    /\s+/g,
                    ''
                );

        return /^[A-ZÀ-Ÿ]{2}/
            .test(normalized);
    }

    setImporteAbonoVentas(rows) {
        return rows.map(row => {
            const factura =
                row.FACTURA || '';

            if (
                !this.isFacturaAbonoVentas(
                    factura
                )
            ) {
                return row;
            }

            const importeFactura =
                row.__ORIGINAL_EXCEL__ === true
                    ? row.__IMPORTE_FACTURA_ORIGINAL__
                    : (
                        row[
                        'IMPORTE FACTURA'
                        ] ?? ''
                    );

            return {
                ...row,

                'FACTURA ABONO':
                    importeFactura,

                /*
                 * Mantenemos IMPORTE FACTURA.
                 * No lo vaciamos.
                 */
                'IMPORTE FACTURA':
                    importeFactura,
            };
        });
    }

    repartirImporteEntreLineas(importeTotal, numeroLineas) {
        if (
            !Number.isInteger(numeroLineas) ||
            numeroLineas <= 0
        ) {
            return [];
        }

        const importeEnCentimos =
            Math.round(Number(importeTotal || 0) * 100);

        const signo =
            importeEnCentimos < 0
                ? -1
                : 1;

        const centimosAbsolutos =
            Math.abs(importeEnCentimos);

        const centimosPorLinea =
            Math.floor(
                centimosAbsolutos / numeroLineas
            );

        let centimosRestantes =
            centimosAbsolutos % numeroLineas;

        return Array.from(
            { length: numeroLineas },
            () => {
                let centimosLinea =
                    centimosPorLinea;

                if (centimosRestantes > 0) {
                    centimosLinea += 1;
                    centimosRestantes -= 1;
                }

                return Number(
                    (
                        signo *
                        centimosLinea /
                        100
                    ).toFixed(2)
                );
            }
        );
    }

    getComprasOutputHeaders() {
        return [
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
            'INCOTERMS',
            'DESCRIPCION_MERCANCIA',
            'CODIGO DE LAS MERCANCÍAS ',
            'MODO DE TRANSPORTE',
            'PAIS DE ORIGEN (A2)',
            'MASA NETA EN KG',
            'PESO MEDIO EN FRA (KG)',
            'UNIDADES SUPLEMENTARIAS',
            'IMPORTE FACTURADO',
            'FACTURA',
            'FACTURA ABONO',
            'PORTES',
            'IMPORTE FACTURA',
            'KM_ESPANA',
            'KM_FRONTERA',
            'IMP. FAC. ABONO',
            'AJUSTE_REDONDEO',
            'AJUSTE_EXTRA',
            'ERROR_PRODUCTO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ];
    }

    sanitizeRowsForExcel(rows) {
        return rows.map(row => {
            const cleanRow = {};

            for (const [key, value] of Object.entries(row)) {
                if (
                    typeof value === 'number' &&
                    !Number.isFinite(value)
                ) {
                    cleanRow[key] = '';
                    continue;
                }

                if (
                    typeof value === 'string' &&
                    value.trim().toUpperCase() === 'NAN'
                ) {
                    cleanRow[key] = '';
                    continue;
                }

                cleanRow[key] = value;
            }

            return cleanRow;
        });
    }

    formatComprasOutputRows(rows) {
        return rows.map(row => ({
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                row[
                'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                ] ?? '',

            INCOTERMS:
                row.INCOTERMS ?? '',

            DESCRIPCION_MERCANCIA:
                row.DESCRIPCION_MERCANCIA ?? '',

            'CODIGO DE LAS MERCANCÍAS ':
                row['CODIGO DE LAS MERCANCÍAS '] ?? '',

            'MODO DE TRANSPORTE':
                row['MODO DE TRANSPORTE'] ??
                row['Modo de transporte'] ??
                '',

            'PAIS DE ORIGEN (A2)':
                row['PAIS DE ORIGEN (A2)'] ?? '',

            'MASA NETA EN KG':
                this.parseExcelNumber(
                    row['MASA NETA EN KG']
                ),

            'PESO MEDIO EN FRA (KG)':
                this.parseExcelNumber(
                    row['PESO MEDIO EN FRA (KG)']
                ),

            'UNIDADES SUPLEMENTARIAS':
                this.parseExcelNumber(
                    row['UNIDADES SUPLEMENTARIAS']
                ),

            'IMPORTE FACTURADO':
                this.parseExcelNumber(
                    row['IMPORTE FACTURADO']
                ),

            FACTURA:
                row.FACTURA ?? '',

            'FACTURA ABONO':
                row['FACTURA ABONO'] ?? '',

            PORTES:
                this.parseExcelNumber(
                    row.PORTES
                ),

            'IMPORTE FACTURA':
                this.parseExcelNumber(
                    row['IMPORTE FACTURA']
                ),

            KM_ESPANA:
                this.parseExcelNumber(
                    row.KM_ESPANA
                ),

            KM_FRONTERA:
                this.parseExcelNumber(
                    row.KM_FRONTERA
                ),

            'IMP. FAC. ABONO':
                this.parseExcelNumber(
                    row['IMP. FAC. ABONO']
                ),

            AJUSTE_REDONDEO:
                this.parseExcelNumber(
                    row.AJUSTE_REDONDEO
                ),

            AJUSTE_EXTRA:
                this.parseExcelNumber(
                    row.AJUSTE_EXTRA
                ),

            ERROR_PRODUCTO:
                row.ERROR_PRODUCTO ?? '',

            AGREGADA_POR_FACTURA_MES:
                row.AGREGADA_POR_FACTURA_MES ?? '',

            ERROR_FACTURA:
                row.ERROR_FACTURA ?? '',
        }));
    }

    applyComprasSheetStyle(
        sheet,
        rows,
        headers
    ) {
        if (!sheet['!ref']) {
            return;
        }

        const range =
            XLSX.utils.decode_range(
                sheet['!ref']
            );

        const HEADER_FILL_COLOR = 'FDE9D9';
        const ZEBRA_FILL_COLOR = 'D9D9D9';
        const HEADER_FONT_COLOR = '000000';
        const BORDER_COLOR = 'BFBFBF';
        const NUMBER_FORMAT = '0.00';

        const informationalHeaders = new Set([
            'IMP. FAC. ABONO',
            'AJUSTE_REDONDEO',
            'AJUSTE_EXTRA',
            'ERROR_PRODUCTO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ]);

        const numericHeaders = new Set([
            'MASA NETA EN KG',
            'PESO MEDIO EN FRA (KG)',
            'UNIDADES SUPLEMENTARIAS',
            'IMPORTE FACTURADO',
            'PORTES',
            'IMPORTE FACTURA',
            'KM_ESPANA',
            'KM_FRONTERA',
            'IMP. FAC. ABONO',
            'AJUSTE_REDONDEO',
            'AJUSTE_EXTRA',
        ]);

        const centeredHeaders = new Set([
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
            'INCOTERMS',
            'CODIGO DE LAS MERCANCÍAS ',
            'MODO DE TRANSPORTE',
            'PAIS DE ORIGEN (A2)',
            'FACTURA',
            'FACTURA ABONO',
            'ERROR_PRODUCTO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ]);

        const borderStyle = {
            top: {
                style: 'thin',
                color: {
                    rgb: BORDER_COLOR,
                },
            },
            bottom: {
                style: 'thin',
                color: {
                    rgb: BORDER_COLOR,
                },
            },
            left: {
                style: 'thin',
                color: {
                    rgb: BORDER_COLOR,
                },
            },
            right: {
                style: 'thin',
                color: {
                    rgb: BORDER_COLOR,
                },
            },
        };

        for (
            let columnIndex = 0;
            columnIndex < headers.length;
            columnIndex += 1
        ) {
            const header =
                headers[columnIndex];

            const cellAddress =
                XLSX.utils.encode_cell({
                    r: 0,
                    c: columnIndex,
                });

            if (!sheet[cellAddress]) {
                continue;
            }

            const isInformationalHeader =
                informationalHeaders.has(header);

            sheet[cellAddress].s = {
                font: {
                    bold: !isInformationalHeader,
                    color: {
                        rgb: HEADER_FONT_COLOR,
                    },
                },

                fill: isInformationalHeader
                    ? {
                        patternType: 'solid',
                        fgColor: {
                            rgb: 'FFFFFF',
                        },
                    }
                    : {
                        patternType: 'solid',
                        fgColor: {
                            rgb: HEADER_FILL_COLOR,
                        },
                    },

                alignment: {
                    horizontal: 'center',
                    vertical: 'center',
                    wrapText: true,
                },

                border: borderStyle,
            };
        }

        let previousFactura = null;
        let facturaBlockIndex = -1;

        for (
            let rowIndex = 1;
            rowIndex <= range.e.r;
            rowIndex += 1
        ) {
            const dataRow =
                rows[rowIndex - 1];

            if (!dataRow) {
                continue;
            }

            const factura = String(
                dataRow.FACTURA || ''
            )
                .trim()
                .toUpperCase()
                .replace(/\s+/g, '');

            if (
                factura &&
                factura !== previousFactura
            ) {
                previousFactura = factura;
                facturaBlockIndex += 1;
            }

            const applyZebraFill =
                facturaBlockIndex >= 0 &&
                facturaBlockIndex % 2 !== 0;

            for (
                let columnIndex = 0;
                columnIndex < headers.length;
                columnIndex += 1
            ) {
                const header =
                    headers[columnIndex];

                const cellAddress =
                    XLSX.utils.encode_cell({
                        r: rowIndex,
                        c: columnIndex,
                    });

                if (!sheet[cellAddress]) {
                    sheet[cellAddress] = {
                        t: 's',
                        v: '',
                    };
                }

                const currentStyle =
                    sheet[cellAddress].s || {};

                const cellStyle = {
                    ...currentStyle,

                    font: {
                        ...(currentStyle.font || {}),
                        bold: false,
                    },

                    alignment: {
                        ...(currentStyle.alignment || {}),
                        vertical: 'center',

                        horizontal:
                            numericHeaders.has(header)
                                ? 'right'
                                : centeredHeaders.has(header)
                                    ? 'center'
                                    : 'left',
                    },

                    border: borderStyle,
                };

                if (numericHeaders.has(header)) {
                    cellStyle.numFmt =
                        NUMBER_FORMAT;
                }

                if (applyZebraFill) {
                    cellStyle.fill = {
                        patternType: 'solid',
                        fgColor: {
                            rgb: ZEBRA_FILL_COLOR,
                        },
                    };
                }

                sheet[cellAddress].s =
                    cellStyle;
            }
        }

        const columnWidths = {
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)': 28,
            INCOTERMS: 12,
            DESCRIPCION_MERCANCIA: 28,
            'CODIGO DE LAS MERCANCÍAS ': 18,
            'MODO DE TRANSPORTE': 18,
            'PAIS DE ORIGEN (A2)': 16,
            'MASA NETA EN KG': 16,
            'PESO MEDIO EN FRA (KG)': 18,
            'UNIDADES SUPLEMENTARIAS': 20,
            'IMPORTE FACTURADO': 18,
            FACTURA: 16,
            'FACTURA ABONO': 18,
            PORTES: 14,
            'IMPORTE FACTURA': 18,
            KM_ESPANA: 14,
            KM_FRONTERA: 14,
            'IMP. FAC. ABONO': 18,
            AJUSTE_REDONDEO: 18,
            AJUSTE_EXTRA: 16,
            ERROR_PRODUCTO: 20,
            AGREGADA_POR_FACTURA_MES: 34,
            ERROR_FACTURA: 24,
        };

        sheet['!cols'] =
            headers.map(header => ({
                wch:
                    columnWidths[header] || 15,
            }));

        sheet['!rows'] = [
            {
                hpt: 46,
            },
        ];

        sheet['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: {
                    r: 0,
                    c: 0,
                },
                e: {
                    r: range.e.r,
                    c: range.e.c,
                },
            }),
        }
    }


    parseFacturaCompra(facturaRaw) {
        if (!facturaRaw) return null;

        const factura =
            String(facturaRaw)
                .trim()
                .toUpperCase();

        if (factura.includes('-')) {
            const [serie, numero] =
                factura.split('-');

            return {
                codserfaccompra:
                    serie.trim(),

                nfaccompra:
                    numero.trim(),
            };
        }

        return {
            codserfaccompra: null,
            nfaccompra: factura
        };
    }


    normalizeFacturaKey({
        serie,
        numero
    }) {
        if (
            serie === undefined ||
            serie === null ||
            numero === undefined ||
            numero === null
        ) {
            return '';
        }

        return `${serie}-${numero}`
            .replace(/\s+/g, '')
            .toUpperCase();
    }

    async filtrarFacturasFueraDeMes({
        rows,
        facturasMap,
        facturasList,
        mesIntrastat,
        tipo,
        getRowFacturaKey,
    }) {
        if (
            !mesIntrastat ||
            facturasList.length === 0
        ) {
            return {
                rows,
                facturasList,
            };
        }

        const facturasFueraDeMes =
            tipo === 'ventas'
                ? await IntrastatModel
                    .getFacturasVentaFueraDeMes({
                        facturasList,
                        mesIntrastat,
                    })
                : await IntrastatModel
                    .getFacturasCompraFueraDeMes({
                        facturasList,
                        mesIntrastat,
                    });

        const facturasFueraDeMesSet =
            new Set(
                facturasFueraDeMes.map(
                    factura => {
                        if (tipo === 'ventas') {
                            return this
                                .normalizeFacturaKey({
                                    serie:
                                        factura
                                            .codserfacventa,

                                    numero:
                                        factura
                                            .nfacventa,
                                });
                        }

                        return this
                            .normalizeFacturaKey({
                                serie:
                                    factura
                                        .codserfaccompra,

                                numero:
                                    factura
                                        .nfaccompra,
                            });
                    }
                )
            );

        if (
            facturasFueraDeMesSet.size === 0
        ) {
            return {
                rows,
                facturasList,
            };
        }

        const rowsFiltradas =
            rows.filter(row => {
                const facturaKey =
                    getRowFacturaKey(row);

                return (
                    facturaKey &&
                    !facturasFueraDeMesSet
                        .has(facturaKey)
                );
            });

        for (
            const facturaKey
            of facturasFueraDeMesSet
        ) {
            facturasMap.delete(facturaKey);
        }

        const facturasListFiltradas =
            facturasList.filter(factura => {
                const facturaKey =
                    tipo === 'ventas'
                        ? this.normalizeFacturaKey({
                            serie:
                                factura.codserfacventa,

                            numero:
                                factura.nfacventa,
                        })
                        : this.normalizeFacturaKey({
                            serie:
                                factura.codserfaccompra,

                            numero:
                                factura.nfaccompra,
                        });

                return (
                    !facturasFueraDeMesSet
                        .has(facturaKey)
                );
            });

        return {
            rows: rowsFiltradas,
            facturasList:
                facturasListFiltradas,
        };
    }

    async generarVentas(req, res) {
        try {
            const tipo =
                req.body.tipo ||
                'ventas';

            const mesIntrastat =
                req.body
                    .mesIntrastat ||
                '';

            if (
                !req.file ||
                !req.file.buffer
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'No file uploaded',
                    });
            }

            const workbook =
                XLSX.read(
                    req.file.buffer,
                    {
                        type:
                            'buffer',
                    }
                );

            const sheet =
                workbook.Sheets[
                workbook
                    .SheetNames[0]
                ];

            let rows =
                XLSX.utils
                    .sheet_to_json(
                        sheet,
                        {
                            defval: '',
                            raw: false,
                        }
                    );

            if (
                !rows.length
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'El archivo está vacío',
                    });
            }

            /*
             * IMPORTANTE:
             * Compras sigue usando su método
             * independiente.
             */
            if (
                tipo ===
                'compras'
            ) {
                return this
                    .generarCompras(
                        req,
                        res,
                        rows
                    );
            }

            let PORTES_KEY =
                this.getColumnKey(
                    rows,
                    'PORTES'
                );

            let IMPORTE_FACTURA_KEY =
                this.getColumnKey(
                    rows,
                    'IMPORTE FACTURA'
                );

            const IMPORTE_FACTURADO_KEY =
                this.getColumnKey(
                    rows,
                    'IMPORTE FACTURADO'
                );

            const FACTURA_KEY =
                this.getColumnKey(
                    rows,
                    'FACTURA'
                );

            if (
                !FACTURA_KEY
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'No se encontró la columna FACTURA en el Excel.',
                    });
            }

            if (
                !IMPORTE_FACTURADO_KEY
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'No se encontró la columna IMPORTE FACTURADO en el Excel.',
                    });
            }

            if (
                !PORTES_KEY
            ) {
                PORTES_KEY =
                    'PORTES';

                rows.forEach(
                    row => {
                        row[
                            PORTES_KEY
                        ] = 0;
                    }
                );
            }

            if (
                !IMPORTE_FACTURA_KEY
            ) {
                IMPORTE_FACTURA_KEY =
                    'IMPORTE FACTURA';

                rows.forEach(
                    row => {
                        row[
                            IMPORTE_FACTURA_KEY
                        ] = 0;
                    }
                );
            }

            /*
             * Eliminamos líneas
             * sin importe.
             */
            rows =
                rows = rows.filter(row => {
                    const base =
                        this.parseExcelNumber(
                            row[
                            IMPORTE_FACTURADO_KEY
                            ]
                        );

                    return (
                        base !== '' &&
                        base !== 0
                    );
                });

            const normalizeFacturaKey =
                facturaRaw =>
                    String(
                        facturaRaw ||
                        ''
                    )
                        .trim()
                        .toUpperCase()
                        .replace(
                            /\s+/g,
                            ''
                        );

            const facturasMap =
                new Map();

            const erroresFacturas =
                [];

            let facturasList =
                [];

            /*
             * Agrupamos las líneas
             * por factura.
             */
            for (
                const row
                of rows
            ) {
                const facturaRaw =
                    row[
                    FACTURA_KEY
                    ];

                if (
                    !facturaRaw
                ) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(
                        facturaRaw
                    );

                if (
                    !facturasMap
                        .has(factura)
                ) {
                    facturasMap
                        .set(
                            factura,
                            []
                        );
                }

                facturasMap
                    .get(factura)
                    .push(row);
            }

            for (
                const factura
                of facturasMap.keys()
            ) {
                const parsed =
                    this
                        .parseFactura(
                            factura
                        );

                if (
                    parsed
                ) {
                    facturasList
                        .push(
                            parsed
                        );
                }
            }

            /*
             * Eliminación de facturas
             * con IVA no permitido.
             */
            const facturasConIvaNoPermitido =
                await IntrastatModel
                    .getFacturasVentaConIvaNoPermitidoByList({
                        facturasList,

                        codigosPermitidos: [
                            '04',
                            '16',
                        ],
                    });

            const facturasConIvaNoPermitidoSet =
                new Set(
                    facturasConIvaNoPermitido
                        .map(
                            factura =>
                                `${factura.codserfacventa}-${factura.nfacventa}`
                                    .replace(
                                        /\s+/g,
                                        ''
                                    )
                                    .toUpperCase()
                        )
                );

            rows =
                rows.filter(
                    row => {
                        const factura =
                            normalizeFacturaKey(
                                row[
                                FACTURA_KEY
                                ]
                            );

                        return (
                            factura &&
                            !facturasConIvaNoPermitidoSet
                                .has(
                                    factura
                                )
                        );
                    }
                );

            for (
                const factura
                of facturasConIvaNoPermitidoSet
            ) {
                facturasMap
                    .delete(
                        factura
                    );
            }

            facturasList =
                facturasList.filter(
                    factura => {
                        const key =
                            `${factura.codserfacventa}-${factura.nfacventa}`
                                .replace(
                                    /\s+/g,
                                    ''
                                )
                                .toUpperCase();

                        return (
                            !facturasConIvaNoPermitidoSet
                                .has(key)
                        );
                    }
                );

            /*
             * Añadir facturas del mes
             * que no estaban en el Excel.
             */
            if (
                mesIntrastat
            ) {
                const facturasExistentes =
                    Array.from(
                        facturasMap.keys()
                    );

                const lineasFaltantes =
                    await IntrastatModel
                        .getLineasVentasIntrastatFaltantesPorMes({
                            mesIntrastat,
                            facturasExistentes,
                        });

                for (
                    const linea
                    of lineasFaltantes
                ) {
                    const facturaKey =
                        `${linea.codserfacventa}-${linea.nfacventa}`
                            .replace(
                                /\s+/g,
                                ''
                            )
                            .toUpperCase();

                    const facturaVisible =
                        `${String(
                            linea
                                .codserfacventa
                        ).trim()}-${String(
                            linea
                                .nfacventa
                        ).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]:
                            facturaVisible,

                        FACTURA:
                            facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(
                                linea
                                    .importe_facturado ||
                                0
                            ),

                        [IMPORTE_FACTURA_KEY]:
                            0,

                        [PORTES_KEY]:
                            0,

                        CODPRODU:
                            linea
                                .codprodu ||
                            '',

                        'NIF VIES':
                            linea
                                .nif_vies ||
                            '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea
                                .codpais_cliente ||
                            '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea
                                .codintrastat ||
                            '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(
                                linea
                                    .unidades_suplementarias ||
                                0
                            ),

                        'MASA NETA EN KG':
                            Number(
                                linea
                                    .masa_neta ||
                                0
                            ),

                        'PAIS DE ORIGEN (A2)':
                            linea
                                .codpaisorigen ||
                            '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - FACTURA DEL MES NO INCLUIDA EN EXCEL',
                    };

                    rows.push(
                        nuevaRow
                    );

                    if (
                        !facturasMap
                            .has(
                                facturaKey
                            )
                    ) {
                        facturasMap
                            .set(
                                facturaKey,
                                []
                            );

                        facturasList
                            .push({
                                codserfacventa:
                                    String(
                                        linea
                                            .codserfacventa
                                    )
                                        .trim(),

                                nfacventa:
                                    String(
                                        linea
                                            .nfacventa
                                    )
                                        .trim(),
                            });
                    }

                    facturasMap
                        .get(
                            facturaKey
                        )
                        .push(
                            nuevaRow
                        );
                }

                /*
                 * Añadir líneas de albaranes
                 * fuera del mes cuando la
                 * factura tiene varios
                 * albaranes.
                 */
                const lineasAlbaranesFueraMes =
                    await IntrastatModel
                        .getLineasVentasIntrastatFaltantesPorFacturaList({
                            mesIntrastat,
                            facturasExistentes,
                        });

                for (
                    const linea
                    of lineasAlbaranesFueraMes
                ) {
                    const facturaKey =
                        `${linea.codserfacventa}-${linea.nfacventa}`
                            .replace(
                                /\s+/g,
                                ''
                            )
                            .toUpperCase();

                    if (
                        !facturasMap
                            .has(
                                facturaKey
                            )
                    ) {
                        continue;
                    }

                    const facturaVisible =
                        `${String(
                            linea
                                .codserfacventa
                        ).trim()}-${String(
                            linea
                                .nfacventa
                        ).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]:
                            facturaVisible,

                        FACTURA:
                            facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(
                                linea
                                    .importe_facturado ||
                                0
                            ),

                        [IMPORTE_FACTURA_KEY]:
                            0,

                        [PORTES_KEY]:
                            0,

                        CODPRODU:
                            linea
                                .codprodu ||
                            '',

                        'NIF VIES':
                            linea
                                .nif_vies ||
                            '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea
                                .codpais_cliente ||
                            '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea
                                .codintrastat ||
                            '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(
                                linea
                                    .unidades_suplementarias ||
                                0
                            ),

                        'MASA NETA EN KG':
                            Number(
                                linea
                                    .masa_neta ||
                                0
                            ),

                        'PAIS DE ORIGEN (A2)':
                            linea
                                .codpaisorigen ||
                            '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - ALBARAN FUERA DEL MES EN FACTURA CON VARIOS ALBARANES',
                    };

                    rows.push(
                        nuevaRow
                    );

                    facturasMap
                        .get(
                            facturaKey
                        )
                        .push(
                            nuevaRow
                        );
                }
            }

            /*
             * Datos auxiliares.
             */
            const incotermsMap =
                await IntrastatModel
                    .getIncotermsByFacturaList(
                        facturasList
                    );

            const kilometrosMap =
                await IntrastatModel
                    .getKilometrosVentaByFacturaList(
                        facturasList
                    );

            const codigosMap =
                await IntrastatModel
                    .getCodigosProductoPorFactura(
                        facturasList
                    );

            /*
             * Asignación de productos
             * por factura.
             */
            for (
                const [
                    factura,
                    lineas,
                ]
                of facturasMap.entries()
            ) {
                let codigos =
                    codigosMap[
                    factura
                    ] || [];

                codigos =
                    codigos.filter(
                        codigo =>
                            codigo &&
                            String(
                                codigo
                            ).trim() !==
                            ''
                    );

                let cursor =
                    0;

                for (
                    const row
                    of lineas
                ) {
                    if (
                        cursor <
                        codigos.length
                    ) {
                        row.CODPRODU =
                            codigos[
                            cursor
                            ];

                        cursor +=
                            1;
                    } else {
                        row.CODPRODU =
                            '';

                        row.ERROR_PRODUCTO =
                            'SIN MATCH';
                    }
                }
            }

            const allCodprodu =
                rows.map(
                    row =>
                        row.CODPRODU
                );

            const descripcionProductos =
                await IntrastatModel
                    .getDescripcionByCodproduList(
                        allCodprodu
                    );

            /*
             * PORTES + total factura.
             */
            for (
                const [
                    factura,
                    lineas,
                ]
                of facturasMap.entries()
            ) {
                if (lineas.length === 0) {
                    continue;
                }

                const parsed =
                    this.parseFactura(
                        factura
                    );

                if (!parsed) {
                    continue;
                }

                const portesTotal =
                    this.parseExcelNumber(
                        await IntrastatModel
                            .getPortesByFactura(
                                parsed
                            )
                    ) || 0;

                const portesPorLinea =
                    this.repartirImporteEntreLineas(
                        portesTotal,
                        lineas.length
                    );

                let totalLineas = 0;

                for (
                    let index = 0;
                    index < lineas.length;
                    index += 1
                ) {
                    const linea =
                        lineas[index];

                    const importeFacturado =
                        this.parseExcelNumber(
                            linea[
                            IMPORTE_FACTURADO_KEY
                            ]
                        ) || 0;

                    const porteLinea =
                        portesPorLinea[index] || 0;

                    linea[
                        PORTES_KEY
                    ] =
                        porteLinea;

                    /*
                     * Fila original:
                     * no modificamos ni
                     * IMPORTE FACTURADO
                     * ni IMPORTE FACTURA.
                     */
                    if (
                        linea.__ORIGINAL_EXCEL__
                    ) {
                        const importeFacturaExistente =
                            this.parseExcelNumber(
                                linea[
                                IMPORTE_FACTURA_KEY
                                ]
                            ) || 0;

                        totalLineas =
                            Number(
                                (
                                    totalLineas +
                                    importeFacturaExistente
                                ).toFixed(2)
                            );

                        continue;
                    }

                    /*
                     * Fila nueva:
                     * IMPORTE FACTURADO viene de BD.
                     * IMPORTE FACTURA sí se calcula.
                     */
                    const importeFacturaNuevo =
                        Number(
                            (
                                importeFacturado +
                                porteLinea
                            ).toFixed(2)
                        );

                    linea[
                        IMPORTE_FACTURA_KEY
                    ] =
                        importeFacturaNuevo;

                    totalLineas =
                        Number(
                            (
                                totalLineas +
                                importeFacturaNuevo
                            ).toFixed(2)
                        );
                }

                const importeBaseBD =
                    this.parseExcelNumber(
                        await IntrastatModel
                            .getTotalFactura(
                                parsed
                            )
                    ) || 0;

                const diferencia =
                    Number(
                        (
                            importeBaseBD -
                            totalLineas
                        ).toFixed(2)
                    );

                /*
                 * Solo informamos.
                 * No corregimos importes originales.
                 */
                if (diferencia !== 0) {
                    erroresFacturas.push({
                        factura,
                        totalExcel:
                            totalLineas,
                        totalBD:
                            importeBaseBD,
                        diferencia,
                    });

                    lineas.forEach(
                        linea => {
                            linea.ERROR_FACTURA =
                                `DESCUADRE (${diferencia})`;
                        }
                    );
                }
            }

            /*
             * Kilómetros.
             */
            for (
                const row
                of rows
            ) {
                const facturaRaw =
                    row[
                    FACTURA_KEY
                    ];

                if (
                    !facturaRaw
                ) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(
                        facturaRaw
                    );

                const km =
                    kilometrosMap[
                    factura
                    ];

                row.KM_ESPANA =
                    km
                        ?.kmsedehastacliente ||
                    '';

                row.KM_FRONTERA =
                    km
                        ?.kmfronteraalcliente ||
                    '';
            }

            /*
             * Incoterms y transporte.
             */
            for (
                const row
                of rows
            ) {
                const facturaRaw =
                    row[
                    FACTURA_KEY
                    ];

                if (
                    !facturaRaw
                ) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(
                        facturaRaw
                    );

                const incotermData =
                    incotermsMap[
                    factura
                    ] || {};

                row.CODINCOTERMS =
                    incotermData
                        .codincoterms ||
                    '';

                row.INCOTERMS =
                    incotermData
                        .codintrastat ||
                    '';

                row[
                    'Modo de transporte'
                ] =
                    incotermData
                        .modoTransporte ||
                    '';
            }

            /*
             * Descripción mercancía.
             */
            for (
                const row
                of rows
            ) {
                const cod =
                    String(
                        row.CODPRODU ||
                        ''
                    )
                        .trim()
                        .toUpperCase();

                row
                    .DESCRIPCION_MERCANCIA =
                    descripcionProductos[
                    cod
                    ] || '';
            }

            const facturasIvaIncorrecto =
                await IntrastatModel
                    .getFacturasConIvaIncorrectoByList(
                        facturasList
                    );

            /*
             * Garantizamos columnas.
             */
            rows.forEach(
                row => {
                    if (
                        !(
                            'KM_ESPANA'
                            in row
                        )
                    ) {
                        row.KM_ESPANA =
                            '';
                    }

                    if (
                        !(
                            'KM_FRONTERA'
                            in row
                        )
                    ) {
                        row.KM_FRONTERA =
                            '';
                    }

                    if (
                        !(
                            'INCOTERMS'
                            in row
                        )
                    ) {
                        row.INCOTERMS =
                            '';
                    }

                    if (
                        !(
                            'CODINCOTERMS'
                            in row
                        )
                    ) {
                        row.CODINCOTERMS =
                            '';
                    }

                    if (
                        !(
                            'Modo de transporte'
                            in row
                        )
                    ) {
                        row[
                            'Modo de transporte'
                        ] = '';
                    }

                    if (
                        !(
                            'ERROR_FACTURA'
                            in row
                        )
                    ) {
                        row.ERROR_FACTURA =
                            '';
                    }

                    if (
                        !(
                            'AJUSTE_REDONDEO'
                            in row
                        )
                    ) {
                        row.AJUSTE_REDONDEO =
                            '';
                    }

                    if (
                        !(
                            'AGREGADA_POR_FACTURA_MES'
                            in row
                        )
                    ) {
                        row
                            .AGREGADA_POR_FACTURA_MES =
                            '';
                    }

                    if (
                        !(
                            'DESCRIPCION_MERCANCIA'
                            in row
                        )
                    ) {
                        row
                            .DESCRIPCION_MERCANCIA =
                            '';
                    }

                    if (
                        !(
                            'CODPRODU'
                            in row
                        )
                    ) {
                        row.CODPRODU =
                            '';
                    }

                    if (
                        !(
                            'FACTURA ABONO'
                            in row
                        )
                    ) {
                        row[
                            'FACTURA ABONO'
                        ] = '';
                    }
                }
            );

            /*
             * Ordenación.
             */
            const sortedRows =
                this
                    .sortRowsByFactura(
                        rows
                    );

            /*
             * Abonos.
             */
            const rowsConImporteAbono =
                this
                    .setImporteAbonoVentas(
                        sortedRows
                    );

            /*
             * Formato final del Excel.
             */
            const outputRows =
                this
                    .formatVentasOutputRows(
                        rowsConImporteAbono
                    );

            const headers =
                this
                    .getVentasOutputHeaders();

            const newSheet =
                XLSX.utils
                    .json_to_sheet(
                        outputRows,
                        {
                            header:
                                headers,
                        }
                    );

            /*
             * Estilo del Excel
             * de referencia.
             */
            this
                .applyVentasReferenceExcelStyle(
                    newSheet,
                    outputRows,
                    headers
                );

            /*
             * Sombreado alterno
             * por factura.
             */
            this
                .applyVentasFacturaZebraStyle(
                    newSheet,
                    outputRows,
                    headers
                );

            const newWorkbook =
                XLSX.utils
                    .book_new();

            XLSX.utils
                .book_append_sheet(
                    newWorkbook,
                    newSheet,
                    'Intrastat'
                );

            const buffer =
                XLSX.write(
                    newWorkbook,
                    {
                        bookType:
                            'xlsx',

                        type:
                            'buffer',
                    }
                );

            const getNombreMesIntrastat =
                value => {
                    if (
                        !value
                    ) {
                        return (
                            'sin_mes'
                        );
                    }

                    const [
                        year,
                        month,
                    ] =
                        String(
                            value
                        ).split(
                            '-'
                        );

                    const nombresMeses =
                        [
                            'enero',
                            'febrero',
                            'marzo',
                            'abril',
                            'mayo',
                            'junio',
                            'julio',
                            'agosto',
                            'septiembre',
                            'octubre',
                            'noviembre',
                            'diciembre',
                        ];

                    const monthIndex =
                        Number(
                            month
                        ) - 1;

                    const nombreMes =
                        nombresMeses[
                        monthIndex
                        ];

                    if (
                        !year ||
                        !nombreMes
                    ) {
                        return (
                            'sin_mes'
                        );
                    }

                    return (
                        `${nombreMes}_${year}`
                    );
                };

            return res
                .json({
                    fileName:
                        `Intrastat_ventas_${getNombreMesIntrastat(
                            mesIntrastat
                        )}.xlsx`,

                    fileBase64:
                        buffer
                            .toString(
                                'base64'
                            ),

                    errores:
                        erroresFacturas,

                    facturasIvaIncorrecto,
                });

        } catch (error) {
            console.error(
                'ERROR INTRASTAT VENTAS:',
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        error.message ||
                        'Error generating intrastat',

                    detail:
                        error.detail ||
                        '',

                    code:
                        error.code ||
                        '',
                });
        }
    }

    async generarCompras(
        req,
        res,
        rows
    ) {
        try {
            const mesIntrastat =
                req.body
                    .mesIntrastat ||
                '';

            const FACTURA_KEY =
                this.getColumnKey(
                    rows,
                    'FACTURA'
                );

            let PORTES_KEY =
                this.getColumnKey(
                    rows,
                    'PORTES'
                );

            let IMPORTE_FACTURA_KEY =
                this.getColumnKey(
                    rows,
                    'IMPORTE FACTURA'
                );

            let PAIS_DESTINO_KEY =
                this.getColumnKey(
                    rows,
                    'PAIS DESTINO'
                );

            const IMPORTE_FACTURADO_KEY =
                this.getColumnKey(
                    rows,
                    'IMPORTE FACTURADO'
                );

            const CODPRODU_KEY =
                this.getColumnKey(
                    rows,
                    'CODPRODU'
                );

            if (!FACTURA_KEY) {
                return res
                    .status(400)
                    .json({
                        error:
                            'No se encontró la columna FACTURA en el Excel.'
                    });
            }

            if (
                !IMPORTE_FACTURADO_KEY
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'No se encontró la columna IMPORTE FACTURADO en el Excel.'
                    });
            }

            if (!PORTES_KEY) {
                PORTES_KEY =
                    'PORTES';

                rows.forEach(row => {
                    row[
                        PORTES_KEY
                    ] = 0;
                });
            }

            if (
                !IMPORTE_FACTURA_KEY
            ) {
                IMPORTE_FACTURA_KEY =
                    'IMPORTE FACTURA';

                rows.forEach(row => {
                    row[
                        IMPORTE_FACTURA_KEY
                    ] = 0;
                });
            }

            if (
                !PAIS_DESTINO_KEY
            ) {
                PAIS_DESTINO_KEY =
                    'PAIS DESTINO';

                rows.forEach(row => {
                    row[
                        PAIS_DESTINO_KEY
                    ] = '';
                });
            }

            if (CODPRODU_KEY) {
                rows =
                    rows.filter(row => {
                        const codprodu =
                            String(
                                row[
                                CODPRODU_KEY
                                ] || ''
                            )
                                .trim()
                                .toUpperCase();

                        return (
                            codprodu !==
                            'PORTES75' &&
                            codprodu !==
                            'COMPRAS'
                        );
                    });
            }

            /*
             * CAMBIO:
             * todos los importes de Compras
             * pasan por parseExcelNumber.
             */
            rows =
                rows.filter(row => {
                    const base =
                        this.parseExcelNumber(
                            row[
                            IMPORTE_FACTURADO_KEY
                            ]
                        ) || 0;

                    return (
                        base !== 0
                    );
                });

            const facturasMap =
                new Map();

            let facturasList = [];

            for (
                const row
                of rows
            ) {
                const facturaRaw =
                    row[
                    FACTURA_KEY
                    ];

                if (!facturaRaw) {
                    continue;
                }

                const parsed =
                    this
                        .parseFacturaCompra(
                            facturaRaw
                        );

                if (
                    !parsed ||
                    !parsed
                        .codserfaccompra
                ) {
                    continue;
                }

                const key =
                    this
                        .normalizeFacturaKey({
                            serie:
                                parsed
                                    .codserfaccompra,

                            numero:
                                parsed
                                    .nfaccompra,
                        });

                if (
                    !facturasMap
                        .has(key)
                ) {
                    facturasMap.set(
                        key,
                        []
                    );

                    facturasList.push(
                        parsed
                    );
                }

                facturasMap
                    .get(key)
                    .push(row);
            }

            const resultadoFiltroMesCompras =
                await this
                    .filtrarFacturasFueraDeMes({
                        rows,
                        facturasMap,
                        facturasList,
                        mesIntrastat,
                        tipo:
                            'compras',

                        getRowFacturaKey:
                            row => {
                                const parsed =
                                    this
                                        .parseFacturaCompra(
                                            row[
                                            FACTURA_KEY
                                            ]
                                        );

                                if (
                                    !parsed ||
                                    !parsed
                                        .codserfaccompra
                                ) {
                                    return '';
                                }

                                return this
                                    .normalizeFacturaKey({
                                        serie:
                                            parsed
                                                .codserfaccompra,

                                        numero:
                                            parsed
                                                .nfaccompra,
                                    });
                            },
                    });

            rows =
                resultadoFiltroMesCompras
                    .rows;

            facturasList =
                resultadoFiltroMesCompras
                    .facturasList;

            const facturasCompraConIvaNoPermitido =
                await IntrastatModel
                    .getFacturasCompraConIvaNoPermitidoByList({
                        facturasList,

                        codigosPermitidos: [
                            '04',
                            '16'
                        ],
                    });

            const facturasCompraConIvaNoPermitidoSet =
                new Set(
                    facturasCompraConIvaNoPermitido
                        .map(
                            factura =>
                                `${factura.codserfaccompra}-${factura.nfaccompra}`
                                    .replace(
                                        /\s+/g,
                                        ''
                                    )
                                    .toUpperCase()
                        )
                );

            rows =
                rows.filter(row => {
                    const parsed =
                        this
                            .parseFacturaCompra(
                                row[
                                FACTURA_KEY
                                ]
                            );

                    if (
                        !parsed ||
                        !parsed
                            .codserfaccompra
                    ) {
                        return false;
                    }

                    const key =
                        this
                            .normalizeFacturaKey({
                                serie:
                                    parsed
                                        .codserfaccompra,

                                numero:
                                    parsed
                                        .nfaccompra,
                            });

                    return (
                        !facturasCompraConIvaNoPermitidoSet
                            .has(key)
                    );
                });

            for (
                const factura
                of facturasCompraConIvaNoPermitidoSet
            ) {
                facturasMap.delete(
                    factura
                );
            }

            facturasList =
                facturasList.filter(
                    factura => {
                        const key =
                            this
                                .normalizeFacturaKey({
                                    serie:
                                        factura
                                            .codserfaccompra,

                                    numero:
                                        factura
                                            .nfaccompra,
                                });

                        return (
                            !facturasCompraConIvaNoPermitidoSet
                                .has(key)
                        );
                    }
                );

            if (mesIntrastat) {
                const facturasExistentes =
                    Array.from(
                        facturasMap.keys()
                    );

                const lineasFaltantes =
                    await IntrastatModel
                        .getLineasComprasIntrastatFaltantesPorMes({
                            mesIntrastat,
                            facturasExistentes,
                        });

                for (
                    const linea
                    of lineasFaltantes
                ) {
                    const facturaKey =
                        this
                            .normalizeFacturaKey({
                                serie:
                                    linea
                                        .codserfaccompra,

                                numero:
                                    linea
                                        .nfaccompra,
                            });

                    const facturaVisible =
                        `${String(
                            linea
                                .codserfaccompra
                        ).trim()}-${String(
                            linea
                                .nfaccompra
                        ).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]:
                            facturaVisible,

                        FACTURA:
                            facturaVisible,

                        /*
                         * CAMBIO:
                         * antes:
                         *
                         * Number(
                         *   linea.importe_facturado || 0
                         * )
                         */
                        [IMPORTE_FACTURADO_KEY]:
                            this.parseExcelNumber(
                                linea.importe_facturado
                            ) || 0,

                        [IMPORTE_FACTURA_KEY]:
                            0,

                        [PORTES_KEY]:
                            0,

                        CODPRODU:
                            linea
                                .codprodu ||
                            '',

                        'NIF VIES':
                            linea
                                .nif_vies ||
                            '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea
                                .codpais_proveedor ||
                            '',

                        PAIS:
                            linea
                                .codpais_proveedor ||
                            '',

                        [PAIS_DESTINO_KEY]:
                            linea
                                .codpais_proveedor ||
                            '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea
                                .codintrastat ||
                            '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(
                                linea
                                    .unidades_suplementarias ||
                                0
                            ),

                        'MASA NETA EN KG':
                            Number(
                                linea
                                    .masa_neta ||
                                0
                            ),

                        'PAIS DE ORIGEN (A2)':
                            linea
                                .codpaisorigen ||
                            '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - FACTURA DEL MES NO INCLUIDA EN EXCEL',
                    };

                    rows.push(
                        nuevaRow
                    );

                    if (
                        !facturasMap
                            .has(
                                facturaKey
                            )
                    ) {
                        facturasMap.set(
                            facturaKey,
                            []
                        );

                        facturasList.push({
                            codserfaccompra:
                                String(
                                    linea
                                        .codserfaccompra
                                ).trim(),

                            nfaccompra:
                                String(
                                    linea
                                        .nfaccompra
                                ).trim(),
                        });
                    }

                    facturasMap
                        .get(
                            facturaKey
                        )
                        .push(
                            nuevaRow
                        );
                }
            }

            const facturasData =
                await IntrastatModel
                    .getFacturasCompraByList(
                        facturasList
                    );

            const proveedores =
                await IntrastatModel
                    .getProveedoresByFacturas(
                        facturasList
                    );

            const kms =
                await IntrastatModel
                    .getKmByProveedores(
                        Object.keys(
                            proveedores
                        )
                    );

            const codigosMap =
                await IntrastatModel
                    .getLineasAlbaranCompraPorFactura(
                        facturasList
                    );

            /*
             * Se mantiene ajustesMap
             * tal y como pediste.
             */
            const ajustesMap =
                await IntrastatModel
                    .getImportesExtraByFacturaCompra(
                        facturasList
                    );

            const incotermsMap =
                await IntrastatModel
                    .getIncotermsCompraByFacturaList(
                        facturasList
                    );

            const facturasIvaIncorrecto =
                await IntrastatModel
                    .getFacturasCompraConIvaIncorrectoByList(
                        facturasList
                    );

            for (
                const [factura, lineasExcel]
                of facturasMap.entries()
            ) {
                const lineasBD =
                    codigosMap[factura] || [];

                /*
                 * Guardamos qué líneas de BD ya tienen
                 * correspondencia en el Excel.
                 */
                const indicesBDUsados =
                    new Set();

                /*
                 * Primero buscamos la línea real
                 * correspondiente a cada fila que ya
                 * existe en el Excel.
                 */
                for (const row of lineasExcel) {
                    const codproduExcel =
                        String(
                            row.CODPRODU ||
                            (
                                CODPRODU_KEY
                                    ? row[CODPRODU_KEY]
                                    : ''
                            ) ||
                            ''
                        )
                            .trim()
                            .toUpperCase();

                    const importeExcel =
                        this.parseExcelNumber(
                            row[
                            IMPORTE_FACTURADO_KEY
                            ]
                        );

                    const indiceCoincidente =
                        lineasBD.findIndex(
                            (lineaBD, index) => {
                                if (
                                    indicesBDUsados.has(
                                        index
                                    )
                                ) {
                                    return false;
                                }

                                const codproduBD =
                                    String(
                                        lineaBD.codprodu ||
                                        ''
                                    )
                                        .trim()
                                        .toUpperCase();

                                const importeBD =
                                    this.parseExcelNumber(
                                        lineaBD
                                            .importeFacturado
                                    );

                                const mismoProducto =
                                    codproduExcel
                                        ? codproduExcel ===
                                        codproduBD
                                        : true;

                                const mismoImporte =
                                    Math.abs(
                                        Number(
                                            importeExcel || 0
                                        ) -
                                        Number(
                                            importeBD || 0
                                        )
                                    ) < 0.01;

                                return (
                                    mismoProducto &&
                                    mismoImporte
                                );
                            }
                        );

                    if (
                        indiceCoincidente !== -1
                    ) {
                        indicesBDUsados.add(
                            indiceCoincidente
                        );

                        const lineaBD =
                            lineasBD[
                            indiceCoincidente
                            ];

                        /*
                         * Aprovechamos la coincidencia
                         * para completar la fila que ya
                         * existía en el Excel.
                         */
                        row.CODPRODU =
                            lineaBD.codprodu || '';

                        row[
                            'CODIGO DE LAS MERCANCÍAS '
                        ] =
                            lineaBD.codintrastat || '';

                        row[
                            'PAIS DE ORIGEN (A2)'
                        ] =
                            lineaBD.codpaisorigen || '';

                        row[
                            'UNIDADES SUPLEMENTARIAS'
                        ] =
                            this.parseExcelNumber(
                                lineaBD
                                    .unidadesSuplementarias
                            ) || 0;

                        row[
                            'MASA NETA EN KG'
                        ] =
                            this.parseExcelNumber(
                                lineaBD.masaNeta
                            ) || 0;

                        row[
                            'PESO MEDIO EN FRA (KG)'
                        ] =
                            this.parseExcelNumber(
                                lineaBD.pesoMedio
                            ) || 0;

                        continue;
                    }

                    /*
                     * Existe una fila en Excel pero no
                     * encontramos su línea en BD.
                     */
                    row.ERROR_PRODUCTO =
                        'SIN MATCH';
                }

                /*
                 * Ahora añadimos solamente las líneas
                 * de BD que NO estaban ya en el Excel.
                 */
                for (
                    let index = 0;
                    index < lineasBD.length;
                    index += 1
                ) {
                    if (
                        indicesBDUsados.has(index)
                    ) {
                        continue;
                    }

                    const lineaBD =
                        lineasBD[index];

                    const nuevaRow = {
                        [FACTURA_KEY]:
                            factura,

                        FACTURA:
                            factura,

                        CODPRODU:
                            lineaBD.codprodu || '',

                        [IMPORTE_FACTURADO_KEY]:
                            this.parseExcelNumber(
                                lineaBD.importeFacturado
                            ) || 0,

                        [IMPORTE_FACTURA_KEY]:
                            0,

                        [PORTES_KEY]:
                            0,

                        'CODIGO DE LAS MERCANCÍAS ':
                            lineaBD.codintrastat || '',

                        'PAIS DE ORIGEN (A2)':
                            lineaBD.codpaisorigen || '',

                        'UNIDADES SUPLEMENTARIAS':
                            this.parseExcelNumber(
                                lineaBD
                                    .unidadesSuplementarias
                            ) || 0,

                        'MASA NETA EN KG':
                            this.parseExcelNumber(
                                lineaBD.masaNeta
                            ) || 0,

                        'PESO MEDIO EN FRA (KG)':
                            this.parseExcelNumber(
                                lineaBD.pesoMedio
                            ) || 0,

                        'FACTURA ABONO':
                            '',

                        'IMP. FAC. ABONO':
                            '',

                        AJUSTE_REDONDEO:
                            '',

                        AJUSTE_EXTRA:
                            '',

                        ERROR_PRODUCTO:
                            '',

                        ERROR_FACTURA:
                            '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - LINEA DE ALBARAN NO INCLUIDA EN EXCEL',
                    };

                    rows.push(
                        nuevaRow
                    );

                    lineasExcel.push(
                        nuevaRow
                    );
                }
            }

            /*
             * Si el Excel tiene más filas que las
             * recuperadas de BD, las marcamos.
             */


            const allCodprodu =
                rows.map(
                    row =>
                        row.CODPRODU
                );

            const descripcionProductos =
                await IntrastatModel
                    .getDescripcionByCodproduList(
                        allCodprodu
                    );

            const erroresFacturas =
                [];

            for (
                const [
                    factura,
                    lineas
                ]
                of facturasMap.entries()
            ) {
                if (
                    lineas.length ===
                    0
                ) {
                    continue;
                }

                const [
                    serie,
                    numero
                ] =
                    factura.split('-');

                const parsed = {
                    codserfaccompra:
                        serie,

                    nfaccompra:
                        numero
                };

                const portesFactura =
                    await IntrastatModel
                        .getPortesByFacturaCompra(
                            parsed
                        );

                const portes75Total =
                    await IntrastatModel
                        .getPortes75ByFacturaCompra(
                            parsed
                        );

                const comprasTotal =
                    await IntrastatModel
                        .getComprasByFacturaCompra(
                            parsed
                        );

                const ajusteExtra =
                    Number(
                        ajustesMap[factura] || 0
                    );

                const portesTotal =
                    Number(
                        portesFactura || 0
                    ) +
                    Number(
                        portes75Total || 0
                    ) +
                    Number(
                        comprasTotal || 0
                    ) +
                    ajusteExtra;

                const portesPorLinea =
                    this.repartirImporteEntreLineas(
                        portesTotal,
                        lineas.length
                    );

                let totalLineas =
                    0;

                for (
                    let lineaIndex = 0;
                    lineaIndex <
                    lineas.length;
                    lineaIndex += 1
                ) {
                    const linea =
                        lineas[
                        lineaIndex
                        ];

                    /*
                     * CAMBIO PRINCIPAL:
                     *
                     * 329.84 sigue siendo
                     * 329.84.
                     *
                     * 329,84 pasa a
                     * 329.84.
                     */
                    const base =
                        this.parseExcelNumber(
                            linea[
                            IMPORTE_FACTURADO_KEY
                            ]
                        ) || 0;

                    const porteLinea =
                        Number(
                            portesPorLinea[
                            lineaIndex
                            ] || 0
                        );

                    linea[
                        PORTES_KEY
                    ] =
                        porteLinea;

                    const totalLinea =
                        Number(
                            (
                                base +
                                porteLinea
                            ).toFixed(2)
                        );

                    linea[
                        IMPORTE_FACTURA_KEY
                    ] =
                        totalLinea;

                    totalLineas +=
                        totalLinea;
                }

                totalLineas =
                    Number(
                        totalLineas
                            .toFixed(2)
                    );

                let totalBD =
                    await IntrastatModel
                        .getTotalFacturaCompra(
                            parsed
                        );

                totalBD =
                    Number(
                        Number(
                            totalBD
                        ).toFixed(2)
                    );

                let diferencia =
                    Number(
                        (
                            totalBD -
                            totalLineas
                        ).toFixed(2)
                    );

                const ajusteMaximo =
                    0.04;

                if (
                    Math.abs(
                        diferencia
                    ) <=
                    ajusteMaximo &&
                    lineas.length >
                    0
                ) {
                    const ultimaLinea =
                        lineas[
                        lineas.length -
                        1
                        ];

                    const importeActual =
                        Number(
                            ultimaLinea[
                            IMPORTE_FACTURA_KEY
                            ]
                        ) || 0;

                    const nuevoImporte =
                        Number(
                            (
                                importeActual +
                                diferencia
                            ).toFixed(2)
                        );

                    ultimaLinea[
                        IMPORTE_FACTURA_KEY
                    ] =
                        nuevoImporte;

                    ultimaLinea
                        .AJUSTE_REDONDEO =
                        diferencia;

                    totalLineas =
                        Number(
                            (
                                totalLineas +
                                diferencia
                            ).toFixed(2)
                        );

                    diferencia =
                        Number(
                            (
                                totalBD -
                                totalLineas
                            ).toFixed(2)
                        );
                }

                if (
                    diferencia !==
                    0
                ) {
                    erroresFacturas
                        .push({
                            factura,

                            totalExcel:
                                totalLineas,

                            totalBD,

                            diferencia
                        });

                    lineas.forEach(
                        linea => {
                            linea
                                .ERROR_FACTURA =
                                `DESCUADRE (${diferencia})`;
                        }
                    );
                }
            }

            for (
                const row
                of rows
            ) {
                const parsed =
                    this
                        .parseFacturaCompra(
                            row[
                            FACTURA_KEY
                            ]
                        );

                if (
                    !parsed ||
                    !parsed
                        .codserfaccompra
                ) {
                    continue;
                }

                const key =
                    this
                        .normalizeFacturaKey({
                            serie:
                                parsed
                                    .codserfaccompra,

                            numero:
                                parsed
                                    .nfaccompra,
                        });

                const factura =
                    facturasData[
                    key
                    ];

                const proveedor =
                    factura
                        ? proveedores[
                        factura
                            .codprove
                        ]
                        : null;

                if (factura) {
                    const codpais =
                        factura
                            .codpais ||
                        proveedor
                            ?.codpais ||
                        '';

                    row.PAIS =
                        codpais;

                    row[
                        PAIS_DESTINO_KEY
                    ] =
                        codpais;

                    row[
                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                    ] =
                        codpais;

                    const km =
                        kms[
                        factura
                            .codprove
                        ];

                    row.KM_ESPANA =
                        km
                            ?.proveedorkmhastasede ||
                        '';

                    row.KM_FRONTERA =
                        km
                            ?.proveedorkmhastafronteraesp ||
                        '';
                }

                const incotermData =
                    incotermsMap[
                    key
                    ] || {};

                row.INCOTERMS =
                    incotermData
                        .codintrastat ||
                    '';

                row[
                    'Modo de transporte'
                ] =
                    incotermData
                        .modoTransporte ||
                    '';

                const cod =
                    String(
                        row.CODPRODU ||
                        ''
                    )
                        .trim()
                        .toUpperCase();

                row
                    .DESCRIPCION_MERCANCIA =
                    descripcionProductos[
                    cod
                    ] || '';
            }

            rows.forEach(row => {
                if (
                    !(
                        'KM_ESPANA'
                        in row
                    )
                ) {
                    row.KM_ESPANA =
                        '';
                }

                if (
                    !(
                        'KM_FRONTERA'
                        in row
                    )
                ) {
                    row.KM_FRONTERA =
                        '';
                }

                if (
                    !(
                        'PAIS DESTINO'
                        in row
                    )
                ) {
                    row[
                        'PAIS DESTINO'
                    ] = '';
                }

                if (
                    !(
                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                        in row
                    )
                ) {
                    row[
                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                    ] = '';
                }

                if (
                    !(
                        'INCOTERMS'
                        in row
                    )
                ) {
                    row.INCOTERMS =
                        '';
                }

                if (
                    !(
                        'Modo de transporte'
                        in row
                    )
                ) {
                    row[
                        'Modo de transporte'
                    ] = '';
                }

                if (
                    !(
                        'ERROR_FACTURA'
                        in row
                    )
                ) {
                    row.ERROR_FACTURA =
                        '';
                }

                if (
                    !(
                        'AJUSTE_REDONDEO'
                        in row
                    )
                ) {
                    row.AJUSTE_REDONDEO =
                        '';
                }

                if (
                    !(
                        'AJUSTE_EXTRA'
                        in row
                    )
                ) {
                    row.AJUSTE_EXTRA =
                        '';
                }

                if (
                    !(
                        'AGREGADA_POR_FACTURA_MES'
                        in row
                    )
                ) {
                    row
                        .AGREGADA_POR_FACTURA_MES =
                        '';
                }

                if (
                    !(
                        'DESCRIPCION_MERCANCIA'
                        in row
                    )
                ) {
                    row
                        .DESCRIPCION_MERCANCIA =
                        '';
                }

                if (
                    !(
                        'CODPRODU'
                        in row
                    )
                ) {
                    row.CODPRODU =
                        '';
                }

                if (
                    !(
                        'ERROR_PRODUCTO'
                        in row
                    )
                ) {
                    row.ERROR_PRODUCTO =
                        '';
                }

                if (
                    !(
                        'FACTURA ABONO'
                        in row
                    )
                ) {
                    row[
                        'FACTURA ABONO'
                    ] = '';
                }

                if (
                    !(
                        'PESO MEDIO EN FRA (KG)'
                        in row
                    )
                ) {
                    row[
                        'PESO MEDIO EN FRA (KG)'
                    ] = '';
                }
            });

            const sortedRows =
                this
                    .sortRowsByFactura(
                        rows
                    );

            const headers =
                this
                    .getComprasOutputHeaders();

            const outputRows =
                this.sanitizeRowsForExcel(
                    this.formatComprasOutputRows(
                        sortedRows
                    )
                );

            const newSheet =
                XLSX.utils
                    .json_to_sheet(
                        outputRows,
                        {
                            header:
                                headers,
                        }
                    );

            this
                .applyComprasSheetStyle(
                    newSheet,
                    outputRows,
                    headers
                );

            const newWorkbook =
                XLSX.utils
                    .book_new();

            XLSX.utils
                .book_append_sheet(
                    newWorkbook,
                    newSheet,
                    'Intrastat'
                );

            const buffer =
                XLSX.write(
                    newWorkbook,
                    {
                        bookType:
                            'xlsx',

                        type:
                            'buffer'
                    }
                );

            return res.json({
                fileName:
                    `intrastat_compras_${Date.now()}.xlsx`,

                fileBase64:
                    buffer
                        .toString(
                            'base64'
                        ),

                errores:
                    erroresFacturas,

                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error(
                'ERROR COMPRAS INTRASTAT:',
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        error.message ||
                        'Error compras intrastat',

                    detail:
                        error.detail ||
                        '',

                    code:
                        error.code ||
                        '',
                });
        }
    }
}