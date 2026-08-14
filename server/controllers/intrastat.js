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
            'IMP. FAC. ABONO',
            'AJUSTE_REDONDEO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ];
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

            // Columnas informativas
            'IMP. FAC. ABONO',
            'AJUSTE_REDONDEO',
            'AJUSTE_EXTRA',
            'ERROR_PRODUCTO',
            'AGREGADA_POR_FACTURA_MES',
            'ERROR_FACTURA',
        ];
    }

    getVentasZebraFillColor() {
        return 'A3A3A3';
    }

    normalizeFacturaForSort(factura) {
        return String(factura || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');
    }

    parseExcelNumber(value) {
        if (
            value === undefined ||
            value === null ||
            value === ''
        ) {
            return '';
        }

        if (typeof value === 'number') {
            return Number.isFinite(value)
                ? value
                : '';
        }

        let normalizedValue = String(value)
            .trim()
            .replace(/\s+/g, '');

        if (!normalizedValue) {
            return '';
        }

        const hasComma = normalizedValue.includes(',');
        const hasPoint = normalizedValue.includes('.');

        if (hasComma && hasPoint) {
            const lastCommaIndex =
                normalizedValue.lastIndexOf(',');

            const lastPointIndex =
                normalizedValue.lastIndexOf('.');

            if (lastCommaIndex > lastPointIndex) {
                normalizedValue = normalizedValue
                    .replace(/\./g, '')
                    .replace(',', '.');
            } else {
                normalizedValue =
                    normalizedValue.replace(/,/g, '');
            }
        } else if (hasComma) {
            normalizedValue =
                normalizedValue.replace(',', '.');
        }

        const numberValue = Number(normalizedValue);

        return Number.isFinite(numberValue)
            ? numberValue
            : '';
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

        /*
         * Estas columnas son únicamente informativas.
         * Sus cabeceras no tendrán fondo ni negrita.
         */
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

        /*
         * Formato de las cabeceras.
         */
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

                /*
                 * Las informativas quedan sin fondo.
                 */
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

        /*
         * Formato de las filas de datos.
         */
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
        };

        sheet['!freeze'] = {
            xSplit: 0,
            ySplit: 1,
            topLeftCell: 'A2',
            activePane: 'bottomLeft',
            state: 'frozen',
        };
    }

    splitFacturaForSort(factura) {
        const normalizedFactura = this.normalizeFacturaForSort(factura);

        const match = normalizedFactura.match(/^([A-ZÀ-ÿ-]*?)(\d+)$/);

        if (!match) {
            return {
                serie: normalizedFactura,
                numero: 0,
                raw: normalizedFactura
            };
        }

        return {
            serie: match[1],
            numero: Number(match[2]),
            raw: normalizedFactura
        };
    }

    sortRowsByFactura(rows) {
        return [...rows].sort((a, b) => {
            const facturaA = this.splitFacturaForSort(a.FACTURA);
            const facturaB = this.splitFacturaForSort(b.FACTURA);

            const serieCompare = facturaA.serie.localeCompare(
                facturaB.serie,
                'es',
                { sensitivity: 'base' }
            );

            if (serieCompare !== 0) {
                return serieCompare;
            }

            if (facturaA.numero !== facturaB.numero) {
                return facturaA.numero - facturaB.numero;
            }

            return facturaA.raw.localeCompare(
                facturaB.raw,
                'es',
                {
                    sensitivity: 'base',
                    numeric: true
                }
            );
        });
    }

    formatVentasOutputRows(rows) {
        return rows.map(row => ({
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                row['ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'] ?? '',

            'CONDICIONES DE ENTREGA':
                row.CODINCOTERMS ?? '',

            'DESCRIPCION_MERCANCIA':
                row.DESCRIPCION_MERCANCIA ?? '',

            'CODIGO DE LAS MERCANCÍAS ':
                row['CODIGO DE LAS MERCANCÍAS '] ?? '',

            'UNIDADES SUPLEMENTARIAS':
                row['UNIDADES SUPLEMENTARIAS'] ?? '',

            'MODALIDAD DE TRANSPORTE (N1)':
                row['Modo de transporte'] ?? '',

            'PAIS DE ORIGEN (A2)':
                row['PAIS DE ORIGEN (A2)'] ?? '',

            'MASA NETA EN KG':
                row['MASA NETA EN KG'] ?? '',

            'IMPORTE FACTURADO':
                row['IMPORTE FACTURADO'] ?? '',

            'NIF VIES':
                row['NIF VIES'] ?? '',

            FACTURA:
                row.FACTURA ?? '',

            'IMPORTE FACTURA':
                row['IMPORTE FACTURA'] ?? '',

            PORTES:
                row.PORTES ?? '',

            KM_ESPANA:
                row.KM_ESPANA ?? '',

            KM_FRONTERA:
                row.KM_FRONTERA ?? '',

            'FACTURA ABONO':
                row['FACTURA ABONO'] ?? '',

            'IMP. FAC. ABONO':
                row['IMP. FAC. ABONO'] ?? '',

            AJUSTE_REDONDEO:
                row.AJUSTE_REDONDEO ?? '',

            AGREGADA_POR_FACTURA_MES:
                row.AGREGADA_POR_FACTURA_MES ?? '',

            ERROR_FACTURA:
                row.ERROR_FACTURA ?? '',
        }));
    }

    applyVentasFacturaZebraStyle(sheet, rows, headers) {
        if (!sheet['!ref']) return;

        const range = XLSX.utils.decode_range(sheet['!ref']);
        const facturaHeader = 'FACTURA';

        if (!headers.includes(facturaHeader)) return;

        let previousFactura = null;
        let currentBlockIndex = -1;

        for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
            const dataRowIndex = rowIndex - 1;
            const row = rows[dataRowIndex];

            if (!row) continue;

            const factura = String(row[facturaHeader] || '')
                .trim()
                .toUpperCase()
                .replace(/\s+/g, '');

            if (!factura) {
                continue;
            }

            if (factura !== previousFactura) {
                previousFactura = factura;
                currentBlockIndex += 1;
            }

            const shouldApplyGrey = currentBlockIndex % 2 !== 0;

            if (!shouldApplyGrey) {
                continue;
            }

            for (
                let colIndex = range.s.c;
                colIndex <= range.e.c;
                colIndex++
            ) {
                const cellAddress = XLSX.utils.encode_cell({
                    r: rowIndex,
                    c: colIndex
                });

                if (!sheet[cellAddress]) {
                    sheet[cellAddress] = {
                        t: 's',
                        v: ''
                    };
                }

                sheet[cellAddress].s = {
                    fill: {
                        patternType: 'solid',
                        fgColor: {
                            rgb: this.getVentasZebraFillColor()
                        }
                    }
                };
            }
        }
    }

    parseFacturaCompra(facturaRaw) {
        if (!facturaRaw) return null;

        const factura = String(facturaRaw)
            .trim()
            .toUpperCase();

        if (factura.includes('-')) {
            const [serie, numero] = factura.split('-');

            return {
                codserfaccompra: serie.trim(),
                nfaccompra: numero.trim(),
            };
        }

        return {
            codserfaccompra: null,
            nfaccompra: factura
        };
    }

    parseFactura(factura) {
        if (!factura) return null;

        const [serie, numero] = String(factura).split('-');

        return {
            codserfacventa: serie?.trim(),
            nfacventa: numero?.trim(),
        };
    }

    normalizeFacturaKey({ serie, numero }) {
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
        if (!mesIntrastat || facturasList.length === 0) {
            return {
                rows,
                facturasList,
            };
        }

        const facturasFueraDeMes =
            tipo === 'ventas'
                ? await IntrastatModel.getFacturasVentaFueraDeMes({
                    facturasList,
                    mesIntrastat,
                })
                : await IntrastatModel.getFacturasCompraFueraDeMes({
                    facturasList,
                    mesIntrastat,
                });

        const facturasFueraDeMesSet = new Set(
            facturasFueraDeMes.map(factura => {
                if (tipo === 'ventas') {
                    return this.normalizeFacturaKey({
                        serie: factura.codserfacventa,
                        numero: factura.nfacventa,
                    });
                }

                return this.normalizeFacturaKey({
                    serie: factura.codserfaccompra,
                    numero: factura.nfaccompra,
                });
            })
        );

        if (facturasFueraDeMesSet.size === 0) {
            return {
                rows,
                facturasList,
            };
        }

        const rowsFiltradas = rows.filter(row => {
            const facturaKey = getRowFacturaKey(row);

            return (
                facturaKey &&
                !facturasFueraDeMesSet.has(facturaKey)
            );
        });

        for (const facturaKey of facturasFueraDeMesSet) {
            facturasMap.delete(facturaKey);
        }

        const facturasListFiltradas = facturasList.filter(factura => {
            const facturaKey =
                tipo === 'ventas'
                    ? this.normalizeFacturaKey({
                        serie: factura.codserfacventa,
                        numero: factura.nfacventa,
                    })
                    : this.normalizeFacturaKey({
                        serie: factura.codserfaccompra,
                        numero: factura.nfaccompra,
                    });

            return !facturasFueraDeMesSet.has(facturaKey);
        });

        return {
            rows: rowsFiltradas,
            facturasList: facturasListFiltradas,
        };
    }

    async generarVentas(req, res) {
        try {
            const tipo = req.body.tipo || 'ventas';
            const mesIntrastat = req.body.mesIntrastat || '';

            if (!req.file || !req.file.buffer) {
                return res.status(400).json({
                    error: 'No file uploaded'
                });
            }

            const workbook = XLSX.read(
                req.file.buffer,
                { type: 'buffer' }
            );

            const sheet =
                workbook.Sheets[workbook.SheetNames[0]];

            let rows = XLSX.utils.sheet_to_json(
                sheet,
                { defval: '' }
            );

            if (!rows.length) {
                return res.status(400).json({
                    error: 'El archivo está vacío'
                });
            }

            if (tipo === 'compras') {
                return this.generarCompras(req, res, rows);
            }

            let PORTES_KEY =
                this.getColumnKey(rows, 'PORTES');

            let IMPORTE_FACTURA_KEY =
                this.getColumnKey(rows, 'IMPORTE FACTURA');

            const IMPORTE_FACTURADO_KEY =
                this.getColumnKey(rows, 'IMPORTE FACTURADO');

            const FACTURA_KEY =
                this.getColumnKey(rows, 'FACTURA');

            if (!FACTURA_KEY) {
                return res.status(400).json({
                    error:
                        'No se encontró la columna FACTURA en el Excel.'
                });
            }

            if (!IMPORTE_FACTURADO_KEY) {
                return res.status(400).json({
                    error:
                        'No se encontró la columna IMPORTE FACTURADO en el Excel.'
                });
            }

            if (!PORTES_KEY) {
                PORTES_KEY = 'PORTES';

                rows.forEach(row => {
                    row[PORTES_KEY] = 0;
                });
            }

            if (!IMPORTE_FACTURA_KEY) {
                IMPORTE_FACTURA_KEY = 'IMPORTE FACTURA';

                rows.forEach(row => {
                    row[IMPORTE_FACTURA_KEY] = 0;
                });
            }

            rows = rows.filter(row => {
                const base =
                    Number(row[IMPORTE_FACTURADO_KEY]) || 0;

                return base !== 0;
            });

            const normalizeFacturaKey = facturaRaw =>
                String(facturaRaw || '')
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');

            const facturasMap = new Map();
            const erroresFacturas = [];
            let facturasList = [];

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];

                if (!facturaRaw) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(facturaRaw);

                if (!facturasMap.has(factura)) {
                    facturasMap.set(factura, []);
                }

                facturasMap.get(factura).push(row);
            }

            for (const factura of facturasMap.keys()) {
                const parsed = this.parseFactura(factura);

                if (parsed) {
                    facturasList.push(parsed);
                }
            }

            const resultadoFiltroMesVentas =
                await this.filtrarFacturasFueraDeMes({
                    rows,
                    facturasMap,
                    facturasList,
                    mesIntrastat,
                    tipo: 'ventas',

                    getRowFacturaKey: row =>
                        normalizeFacturaKey(row[FACTURA_KEY]),
                });

            rows = resultadoFiltroMesVentas.rows;
            facturasList =
                resultadoFiltroMesVentas.facturasList;

            const facturasConIvaNoPermitido =
                await IntrastatModel
                    .getFacturasVentaConIvaNoPermitidoByList({
                        facturasList,
                        codigosPermitidos: ['04', '16'],
                    });

            const facturasConIvaNoPermitidoSet = new Set(
                facturasConIvaNoPermitido.map(factura =>
                    `${factura.codserfacventa}-${factura.nfacventa}`
                        .replace(/\s+/g, '')
                        .toUpperCase()
                )
            );

            rows = rows.filter(row => {
                const factura =
                    normalizeFacturaKey(row[FACTURA_KEY]);

                return (
                    factura &&
                    !facturasConIvaNoPermitidoSet.has(factura)
                );
            });

            for (
                const factura of facturasConIvaNoPermitidoSet
            ) {
                facturasMap.delete(factura);
            }

            facturasList = facturasList.filter(factura => {
                const key =
                    `${factura.codserfacventa}-${factura.nfacventa}`
                        .replace(/\s+/g, '')
                        .toUpperCase();

                return !facturasConIvaNoPermitidoSet.has(key);
            });

            if (mesIntrastat) {
                const facturasExistentes =
                    Array.from(facturasMap.keys());

                const lineasFaltantes =
                    await IntrastatModel
                        .getLineasVentasIntrastatFaltantesPorMes({
                            mesIntrastat,
                            facturasExistentes,
                        });

                for (const linea of lineasFaltantes) {
                    const facturaKey =
                        `${linea.codserfacventa}-${linea.nfacventa}`
                            .replace(/\s+/g, '')
                            .toUpperCase();

                    const facturaVisible =
                        `${String(linea.codserfacventa).trim()}-${String(
                            linea.nfacventa
                        ).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]: facturaVisible,
                        FACTURA: facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(
                                linea.importe_facturado || 0
                            ),

                        [IMPORTE_FACTURA_KEY]: 0,
                        [PORTES_KEY]: 0,

                        CODPRODU:
                            linea.codprodu || '',

                        'NIF VIES':
                            linea.nif_vies || '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea.codpais_cliente || '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea.codintrastat || '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(
                                linea.unidades_suplementarias || 0
                            ),

                        'MASA NETA EN KG':
                            Number(linea.masa_neta || 0),

                        'PAIS DE ORIGEN (A2)':
                            linea.codpaisorigen || '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - FACTURA DEL MES NO INCLUIDA EN EXCEL',
                    };

                    rows.push(nuevaRow);

                    if (!facturasMap.has(facturaKey)) {
                        facturasMap.set(facturaKey, []);

                        facturasList.push({
                            codserfacventa:
                                String(
                                    linea.codserfacventa
                                ).trim(),

                            nfacventa:
                                String(
                                    linea.nfacventa
                                ).trim(),
                        });
                    }

                    facturasMap
                        .get(facturaKey)
                        .push(nuevaRow);
                }
            }

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

            for (
                const [factura, lineas]
                of facturasMap.entries()
            ) {
                let codigos =
                    codigosMap[factura] || [];

                codigos = codigos.filter(
                    codigo =>
                        codigo &&
                        String(codigo).trim() !== ''
                );

                let cursor = 0;

                for (const row of lineas) {
                    if (cursor < codigos.length) {
                        row.CODPRODU = codigos[cursor];
                        cursor += 1;
                    } else {
                        row.CODPRODU = '';
                        row.ERROR_PRODUCTO = 'SIN MATCH';
                    }
                }
            }

            const allCodprodu =
                rows.map(row => row.CODPRODU);

            const descripcionProductos =
                await IntrastatModel
                    .getDescripcionByCodproduList(
                        allCodprodu
                    );

            for (
                const [factura, lineas]
                of facturasMap.entries()
            ) {
                if (lineas.length === 0) {
                    continue;
                }

                const parsed =
                    this.parseFactura(factura);

                if (!parsed) {
                    continue;
                }

                const portesTotal =
                    await IntrastatModel
                        .getPortesByFactura(parsed);

                const portesPorLinea =
                    Number(
                        (
                            portesTotal / lineas.length
                        ).toFixed(2)
                    );

                let totalLineas = 0;

                for (const linea of lineas) {
                    const base =
                        Number(
                            linea[IMPORTE_FACTURADO_KEY]
                        ) || 0;

                    linea[PORTES_KEY] =
                        portesPorLinea;

                    const totalLinea =
                        Number(
                            (
                                base + portesPorLinea
                            ).toFixed(2)
                        );

                    linea[IMPORTE_FACTURA_KEY] =
                        totalLinea;

                    totalLineas += totalLinea;
                }

                totalLineas =
                    Number(totalLineas.toFixed(2));

                let importeBaseBD =
                    await IntrastatModel
                        .getTotalFactura(parsed);

                importeBaseBD =
                    Number(
                        Number(importeBaseBD).toFixed(2)
                    );

                let diferencia =
                    Number(
                        (
                            importeBaseBD - totalLineas
                        ).toFixed(2)
                    );

                const ajusteMaximo = 0.04;

                if (
                    Math.abs(diferencia) <= ajusteMaximo &&
                    lineas.length > 0
                ) {
                    const ultimaLinea =
                        lineas[lineas.length - 1];

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
                    ] = nuevoImporte;

                    ultimaLinea.AJUSTE_REDONDEO =
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
                                importeBaseBD -
                                totalLineas
                            ).toFixed(2)
                        );
                }

                if (diferencia !== 0) {
                    erroresFacturas.push({
                        factura,
                        totalExcel: totalLineas,
                        totalBD: importeBaseBD,
                        diferencia
                    });

                    lineas.forEach(linea => {
                        linea.ERROR_FACTURA =
                            `DESCUADRE (${diferencia})`;
                    });
                }
            }

            for (const row of rows) {
                const facturaRaw =
                    row[FACTURA_KEY];

                if (!facturaRaw) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(facturaRaw);

                const km =
                    kilometrosMap[factura];

                row.KM_ESPANA =
                    km?.kmsedehastacliente || '';

                row.KM_FRONTERA =
                    km?.kmfronteraalcliente || '';
            }

            for (const row of rows) {
                const facturaRaw =
                    row[FACTURA_KEY];

                if (!facturaRaw) {
                    continue;
                }

                const factura =
                    normalizeFacturaKey(facturaRaw);

                const incotermData =
                    incotermsMap[factura] || {};

                row.CODINCOTERMS =
                    incotermData.codincoterms || '';

                row.INCOTERMS =
                    incotermData.codintrastat || '';

                row['Modo de transporte'] =
                    incotermData.modoTransporte || '';
            }

            for (const row of rows) {
                const cod =
                    String(row.CODPRODU || '')
                        .trim()
                        .toUpperCase();

                row.DESCRIPCION_MERCANCIA =
                    descripcionProductos[cod] || '';
            }

            const facturasIvaIncorrecto =
                await IntrastatModel
                    .getFacturasConIvaIncorrectoByList(
                        facturasList
                    );

            rows.forEach(row => {
                if (!('KM_ESPANA' in row)) {
                    row.KM_ESPANA = '';
                }

                if (!('KM_FRONTERA' in row)) {
                    row.KM_FRONTERA = '';
                }

                if (!('INCOTERMS' in row)) {
                    row.INCOTERMS = '';
                }

                if (!('CODINCOTERMS' in row)) {
                    row.CODINCOTERMS = '';
                }

                if (!('Modo de transporte' in row)) {
                    row['Modo de transporte'] = '';
                }

                if (!('ERROR_FACTURA' in row)) {
                    row.ERROR_FACTURA = '';
                }

                if (!('AJUSTE_REDONDEO' in row)) {
                    row.AJUSTE_REDONDEO = '';
                }

                if (!('AGREGADA_POR_FACTURA_MES' in row)) {
                    row.AGREGADA_POR_FACTURA_MES = '';
                }

                if (!('DESCRIPCION_MERCANCIA' in row)) {
                    row.DESCRIPCION_MERCANCIA = '';
                }

                if (!('CODPRODU' in row)) {
                    row.CODPRODU = '';
                }
            });

            const sortedRows =
                this.sortRowsByFactura(rows);

            const outputRows =
                this.formatVentasOutputRows(
                    sortedRows
                );

            const headers =
                this.getVentasOutputHeaders();

            const newSheet =
                XLSX.utils.json_to_sheet(
                    outputRows,
                    { header: headers }
                );

            this.applyVentasFacturaZebraStyle();

            const newWorkbook =
                XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                newWorkbook,
                newSheet,
                'Intrastat'
            );

            const buffer =
                XLSX.write(
                    newWorkbook,
                    {
                        bookType: 'xlsx',
                        type: 'buffer'
                    }
                );

            return res.json({
                fileName:
                    `intrastat_${Date.now()}.xlsx`,

                fileBase64:
                    buffer.toString('base64'),

                errores:
                    erroresFacturas,

                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error(
                'ERROR INTRASTAT VENTAS:',
                error
            );

            return res.status(500).json({
                error:
                    error.message ||
                    'Error generating intrastat',

                detail:
                    error.detail || '',

                code:
                    error.code || '',
            });
        }
    }

    async generarCompras(req, res, rows) {
        try {
            const mesIntrastat =
                req.body.mesIntrastat || '';

            const FACTURA_KEY =
                this.getColumnKey(rows, 'FACTURA');

            let PORTES_KEY =
                this.getColumnKey(rows, 'PORTES');

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
                return res.status(400).json({
                    error:
                        'No se encontró la columna FACTURA en el Excel.'
                });
            }

            if (!IMPORTE_FACTURADO_KEY) {
                return res.status(400).json({
                    error:
                        'No se encontró la columna IMPORTE FACTURADO en el Excel.'
                });
            }

            if (!PORTES_KEY) {
                PORTES_KEY = 'PORTES';

                rows.forEach(row => {
                    row[PORTES_KEY] = 0;
                });
            }

            if (!IMPORTE_FACTURA_KEY) {
                IMPORTE_FACTURA_KEY =
                    'IMPORTE FACTURA';

                rows.forEach(row => {
                    row[IMPORTE_FACTURA_KEY] = 0;
                });
            }

            if (!PAIS_DESTINO_KEY) {
                PAIS_DESTINO_KEY =
                    'PAIS DESTINO';

                rows.forEach(row => {
                    row[PAIS_DESTINO_KEY] = '';
                });
            }

            if (CODPRODU_KEY) {
                rows = rows.filter(row => {
                    const codprodu = String(
                        row[CODPRODU_KEY] || ''
                    )
                        .trim()
                        .toUpperCase();

                    return (
                        codprodu !== 'PORTES75' &&
                        codprodu !== 'COMPRAS'
                    );
                });
            }

            rows = rows.filter(row => {
                const base =
                    Number(
                        row[IMPORTE_FACTURADO_KEY]
                    ) || 0;

                return base !== 0;
            });

            const facturasMap = new Map();
            let facturasList = [];

            for (const row of rows) {
                const facturaRaw =
                    row[FACTURA_KEY];

                if (!facturaRaw) {
                    continue;
                }

                const parsed =
                    this.parseFacturaCompra(
                        facturaRaw
                    );

                if (
                    !parsed ||
                    !parsed.codserfaccompra
                ) {
                    continue;
                }

                const key =
                    this.normalizeFacturaKey({
                        serie:
                            parsed.codserfaccompra,

                        numero:
                            parsed.nfaccompra,
                    });

                if (!facturasMap.has(key)) {
                    facturasMap.set(key, []);
                    facturasList.push(parsed);
                }

                facturasMap
                    .get(key)
                    .push(row);
            }

            const resultadoFiltroMesCompras =
                await this.filtrarFacturasFueraDeMes({
                    rows,
                    facturasMap,
                    facturasList,
                    mesIntrastat,
                    tipo: 'compras',

                    getRowFacturaKey: row => {
                        const parsed =
                            this.parseFacturaCompra(
                                row[FACTURA_KEY]
                            );

                        if (
                            !parsed ||
                            !parsed.codserfaccompra
                        ) {
                            return '';
                        }

                        return this.normalizeFacturaKey({
                            serie:
                                parsed.codserfaccompra,

                            numero:
                                parsed.nfaccompra,
                        });
                    },
                });

            rows =
                resultadoFiltroMesCompras.rows;

            facturasList =
                resultadoFiltroMesCompras.facturasList;

            const facturasCompraConIvaNoPermitido =
                await IntrastatModel
                    .getFacturasCompraConIvaNoPermitidoByList({
                        facturasList,
                        codigosPermitidos: ['04', '16'],
                    });

            const facturasCompraConIvaNoPermitidoSet =
                new Set(
                    facturasCompraConIvaNoPermitido.map(
                        factura =>
                            `${factura.codserfaccompra}-${factura.nfaccompra}`
                                .replace(/\s+/g, '')
                                .toUpperCase()
                    )
                );

            rows = rows.filter(row => {
                const parsed =
                    this.parseFacturaCompra(
                        row[FACTURA_KEY]
                    );

                if (
                    !parsed ||
                    !parsed.codserfaccompra
                ) {
                    return false;
                }

                const key =
                    this.normalizeFacturaKey({
                        serie:
                            parsed.codserfaccompra,

                        numero:
                            parsed.nfaccompra,
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
                facturasMap.delete(factura);
            }

            facturasList = facturasList.filter(
                factura => {
                    const key =
                        this.normalizeFacturaKey({
                            serie:
                                factura.codserfaccompra,

                            numero:
                                factura.nfaccompra,
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

                for (const linea of lineasFaltantes) {
                    const facturaKey =
                        this.normalizeFacturaKey({
                            serie:
                                linea.codserfaccompra,

                            numero:
                                linea.nfaccompra,
                        });

                    const facturaVisible =
                        `${String(
                            linea.codserfaccompra
                        ).trim()}-${String(
                            linea.nfaccompra
                        ).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]:
                            facturaVisible,

                        FACTURA:
                            facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(
                                linea.importe_facturado ||
                                0
                            ),

                        [IMPORTE_FACTURA_KEY]:
                            0,

                        [PORTES_KEY]:
                            0,

                        CODPRODU:
                            linea.codprodu || '',

                        'NIF VIES':
                            linea.nif_vies || '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea.codpais_proveedor ||
                            '',

                        PAIS:
                            linea.codpais_proveedor ||
                            '',

                        [PAIS_DESTINO_KEY]:
                            linea.codpais_proveedor ||
                            '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea.codintrastat || '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(
                                linea.unidades_suplementarias ||
                                0
                            ),

                        'MASA NETA EN KG':
                            Number(
                                linea.masa_neta || 0
                            ),

                        'PAIS DE ORIGEN (A2)':
                            linea.codpaisorigen || '',

                        AGREGADA_POR_FACTURA_MES:
                            'SI - FACTURA DEL MES NO INCLUIDA EN EXCEL',
                    };

                    rows.push(nuevaRow);

                    if (!facturasMap.has(facturaKey)) {
                        facturasMap.set(
                            facturaKey,
                            []
                        );

                        facturasList.push({
                            codserfaccompra:
                                String(
                                    linea.codserfaccompra
                                ).trim(),

                            nfaccompra:
                                String(
                                    linea.nfaccompra
                                ).trim(),
                        });
                    }

                    facturasMap
                        .get(facturaKey)
                        .push(nuevaRow);
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
                        Object.keys(proveedores)
                    );

            const codigosMap =
                await IntrastatModel
                    .getLineasAlbaranCompraPorFactura(
                        facturasList
                    );

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
                const [factura, lineas]
                of facturasMap.entries()
            ) {
                let codigos =
                    codigosMap[factura] || [];

                codigos = codigos.filter(
                    codigo =>
                        codigo &&
                        String(codigo).trim() !== ''
                );

                let cursor = 0;

                for (const row of lineas) {
                    if (cursor < codigos.length) {
                        row.CODPRODU =
                            codigos[cursor];

                        cursor += 1;
                    } else {
                        row.CODPRODU = '';
                        row.ERROR_PRODUCTO =
                            'SIN MATCH';
                    }
                }
            }

            const allCodprodu =
                rows.map(row => row.CODPRODU);

            const descripcionProductos =
                await IntrastatModel
                    .getDescripcionByCodproduList(
                        allCodprodu
                    );

            const erroresFacturas = [];

            for (
                const [factura, lineas]
                of facturasMap.entries()
            ) {
                if (lineas.length === 0) {
                    continue;
                }

                const [serie, numero] =
                    factura.split('-');

                const parsed = {
                    codserfaccompra: serie,
                    nfaccompra: numero
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

                const portesTotal =
                    Number(portesFactura || 0) +
                    Number(portes75Total || 0) +
                    Number(comprasTotal || 0);

                const portesPorLinea =
                    this.repartirImporteEntreLineas(
                        portesTotal,
                        lineas.length
                    );

                const ajusteExtra =
                    Number(
                        ajustesMap[factura] || 0
                    );

                if (
                    ajusteExtra !== 0 &&
                    lineas.length > 0
                ) {
                    const ultimaLinea =
                        lineas[lineas.length - 1];

                    const actual =
                        Number(
                            String(
                                ultimaLinea[
                                IMPORTE_FACTURADO_KEY
                                ] || 0
                            ).replace(',', '.')
                        ) || 0;

                    ultimaLinea[
                        IMPORTE_FACTURADO_KEY
                    ] = Number(
                        (
                            actual +
                            ajusteExtra
                        ).toFixed(2)
                    );

                    ultimaLinea.AJUSTE_EXTRA =
                        ajusteExtra;
                }

                let totalLineas = 0;

                for (
                    let lineaIndex = 0;
                    lineaIndex < lineas.length;
                    lineaIndex += 1
                ) {
                    const linea = lineas[lineaIndex];

                    const base =
                        Number(
                            String(
                                linea[
                                IMPORTE_FACTURADO_KEY
                                ] || 0
                            ).replace(',', '.')
                        ) || 0;

                    const porteLinea =
                        Number(
                            portesPorLinea[lineaIndex] || 0
                        );

                    linea[PORTES_KEY] =
                        porteLinea;

                    const totalLinea =
                        Number(
                            (
                                base +
                                porteLinea
                            ).toFixed(2)
                        );

                    linea[IMPORTE_FACTURA_KEY] =
                        totalLinea;

                    totalLineas += totalLinea;
                }

                totalLineas =
                    Number(totalLineas.toFixed(2));

                let totalBD =
                    await IntrastatModel
                        .getTotalFacturaCompra(
                            parsed
                        );

                totalBD =
                    Number(
                        Number(totalBD).toFixed(2)
                    );

                let diferencia =
                    Number(
                        (
                            totalBD -
                            totalLineas
                        ).toFixed(2)
                    );

                const ajusteMaximo = 0.04;

                if (
                    Math.abs(diferencia) <=
                    ajusteMaximo &&
                    lineas.length > 0
                ) {
                    const ultimaLinea =
                        lineas[lineas.length - 1];

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
                    ] = nuevoImporte;

                    ultimaLinea.AJUSTE_REDONDEO =
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

                if (diferencia !== 0) {
                    erroresFacturas.push({
                        factura,
                        totalExcel:
                            totalLineas,

                        totalBD,

                        diferencia
                    });

                    lineas.forEach(linea => {
                        linea.ERROR_FACTURA =
                            `DESCUADRE (${diferencia})`;
                    });
                }
            }

            for (const row of rows) {
                const parsed =
                    this.parseFacturaCompra(
                        row[FACTURA_KEY]
                    );

                if (
                    !parsed ||
                    !parsed.codserfaccompra
                ) {
                    continue;
                }

                const key =
                    this.normalizeFacturaKey({
                        serie:
                            parsed.codserfaccompra,

                        numero:
                            parsed.nfaccompra,
                    });

                const factura =
                    facturasData[key];

                const proveedor =
                    factura
                        ? proveedores[
                        factura.codprove
                        ]
                        : null;

                if (factura) {
                    const codpais =
                        factura.codpais ||
                        proveedor?.codpais ||
                        '';

                    row.PAIS = codpais;

                    row[PAIS_DESTINO_KEY] =
                        codpais;

                    row[
                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'
                    ] = codpais;

                    const km =
                        kms[factura.codprove];

                    row.KM_ESPANA =
                        km?.proveedorkmhastasede ||
                        '';

                    row.KM_FRONTERA =
                        km?.proveedorkmhastafronteraesp ||
                        '';
                }

                const incotermData =
                    incotermsMap[key] || {};

                row.INCOTERMS =
                    incotermData.codintrastat ||
                    '';

                row['Modo de transporte'] =
                    incotermData.modoTransporte ||
                    '';

                const cod =
                    String(row.CODPRODU || '')
                        .trim()
                        .toUpperCase();

                row.DESCRIPCION_MERCANCIA =
                    descripcionProductos[cod] ||
                    '';
            }

            rows.forEach(row => {
                if (!('KM_ESPANA' in row)) {
                    row.KM_ESPANA = '';
                }

                if (!('KM_FRONTERA' in row)) {
                    row.KM_FRONTERA = '';
                }

                if (!('PAIS DESTINO' in row)) {
                    row['PAIS DESTINO'] = '';
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

                if (!('INCOTERMS' in row)) {
                    row.INCOTERMS = '';
                }

                if (!('Modo de transporte' in row)) {
                    row['Modo de transporte'] = '';
                }

                if (!('ERROR_FACTURA' in row)) {
                    row.ERROR_FACTURA = '';
                }

                if (!('AJUSTE_REDONDEO' in row)) {
                    row.AJUSTE_REDONDEO = '';
                }

                if (!('AJUSTE_EXTRA' in row)) {
                    row.AJUSTE_EXTRA = '';
                }

                if (!('AGREGADA_POR_FACTURA_MES' in row)) {
                    row.AGREGADA_POR_FACTURA_MES = '';
                }

                if (!('DESCRIPCION_MERCANCIA' in row)) {
                    row.DESCRIPCION_MERCANCIA = '';
                }

                if (!('CODPRODU' in row)) {
                    row.CODPRODU = '';
                }

                if (!('ERROR_PRODUCTO' in row)) {
                    row.ERROR_PRODUCTO = '';
                }

                if (!('FACTURA ABONO' in row)) {
                    row['FACTURA ABONO'] = '';
                }

                if (!('PESO MEDIO EN FRA (KG)' in row)) {
                    row['PESO MEDIO EN FRA (KG)'] = '';
                }
            });

            const sortedRows =
                this.sortRowsByFactura(rows);

            const headers =
                this.getComprasOutputHeaders();

            const outputRows =
                this.formatComprasOutputRows(
                    sortedRows
                );

            const newSheet =
                XLSX.utils.json_to_sheet(
                    outputRows,
                    {
                        header: headers,
                    }
                );

            this.applyComprasSheetStyle(
                newSheet,
                outputRows,
                headers
            );

            const newWorkbook =
                XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                newWorkbook,
                newSheet,
                'Intrastat'
            );

            const buffer =
                XLSX.write(
                    newWorkbook,
                    {
                        bookType: 'xlsx',
                        type: 'buffer'
                    }
                );

            return res.json({
                fileName:
                    `intrastat_compras_${Date.now()}.xlsx`,

                fileBase64:
                    buffer.toString('base64'),

                errores:
                    erroresFacturas,

                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error(
                'ERROR COMPRAS INTRASTAT:',
                error
            );

            return res.status(500).json({
                error:
                    error.message ||
                    'Error compras intrastat',

                detail:
                    error.detail || '',

                code:
                    error.code || '',
            });
        }
    }
}