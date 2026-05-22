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

    getComprasOutputHeaders() {
        return [
            'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)',
            'INCOTERMS',
            'DESCRIPCION_MERCANCIA',
            'CODIGO DE LAS MERCANCÍAS ',
            'Modo de transporte',
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
            'ERROR_FACTURA',
            'AJUSTE_REDONDEO',
            'AJUSTE_EXTRA',
            'ERROR_PRODUCTO',
            'AGREGADA_POR_FACTURA_MES',
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

            for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
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

        const factura = String(facturaRaw).trim().toUpperCase();

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

    async generarVentas(req, res) {
        try {
            const tipo = req.body.tipo || 'ventas';
            const mesIntrastat = req.body.mesIntrastat || '';

            if (!req.file || !req.file.buffer) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows.length) {
                return res.status(400).json({ error: 'El archivo está vacío' });
            }

            if (tipo === 'compras') {
                return this.generarCompras(req, res, rows);
            }

            let PORTES_KEY = this.getColumnKey(rows, 'PORTES');
            let IMPORTE_FACTURA_KEY = this.getColumnKey(rows, 'IMPORTE FACTURA');
            const IMPORTE_FACTURADO_KEY = this.getColumnKey(rows, 'IMPORTE FACTURADO');
            const FACTURA_KEY = this.getColumnKey(rows, 'FACTURA');

            if (!FACTURA_KEY) {
                return res.status(400).json({
                    error: 'No se encontró la columna FACTURA en el Excel.'
                });
            }

            if (!IMPORTE_FACTURADO_KEY) {
                return res.status(400).json({
                    error: 'No se encontró la columna IMPORTE FACTURADO en el Excel.'
                });
            }

            if (!PORTES_KEY) {
                PORTES_KEY = 'PORTES';
                rows.forEach(r => r[PORTES_KEY] = 0);
            }

            if (!IMPORTE_FACTURA_KEY) {
                IMPORTE_FACTURA_KEY = 'IMPORTE FACTURA';
                rows.forEach(r => r[IMPORTE_FACTURA_KEY] = 0);
            }

            rows = rows.filter(row => {
                const base = Number(row[IMPORTE_FACTURADO_KEY]) || 0;
                return base !== 0;
            });

            const normalizeFacturaKey = (facturaRaw) => {
                return String(facturaRaw || '')
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');
            };

            const facturasMap = new Map();
            const erroresFacturas = [];
            let facturasList = [];

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = normalizeFacturaKey(facturaRaw);

                if (!facturasMap.has(factura)) {
                    facturasMap.set(factura, []);
                }

                facturasMap.get(factura).push(row);
            }

            for (const factura of facturasMap.keys()) {
                const parsed = this.parseFactura(factura);
                if (parsed) facturasList.push(parsed);
            }

            const facturasConIvaNoPermitido =
                await IntrastatModel.getFacturasVentaConIvaNoPermitidoByList({
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
                const factura = normalizeFacturaKey(row[FACTURA_KEY]);
                return factura && !facturasConIvaNoPermitidoSet.has(factura);
            });

            for (const factura of facturasConIvaNoPermitidoSet) {
                facturasMap.delete(factura);
            }

            facturasList = facturasList.filter(factura => {
                const key = `${factura.codserfacventa}-${factura.nfacventa}`
                    .replace(/\s+/g, '')
                    .toUpperCase();

                return !facturasConIvaNoPermitidoSet.has(key);
            });

            if (mesIntrastat) {
                const facturasExistentes = Array.from(facturasMap.keys());

                const lineasFaltantes =
                    await IntrastatModel.getLineasVentasIntrastatFaltantesPorMes({
                        mesIntrastat,
                        facturasExistentes,
                    });

                for (const linea of lineasFaltantes) {
                    const facturaKey = `${linea.codserfacventa}-${linea.nfacventa}`
                        .replace(/\s+/g, '')
                        .toUpperCase();

                    const facturaVisible =
                        `${String(linea.codserfacventa).trim()}-${String(linea.nfacventa).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]: facturaVisible,
                        FACTURA: facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(linea.importe_facturado || 0),

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
                            Number(linea.unidades_suplementarias || 0),

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
                            codserfacventa: String(linea.codserfacventa).trim(),
                            nfacventa: String(linea.nfacventa).trim(),
                        });
                    }

                    facturasMap.get(facturaKey).push(nuevaRow);
                }
            }

            const incotermsMap =
                await IntrastatModel.getIncotermsByFacturaList(facturasList);

            const kilometrosMap =
                await IntrastatModel.getKilometrosVentaByFacturaList(facturasList);

            const codigosMap =
                await IntrastatModel.getCodigosProductoPorFactura(facturasList);

            for (const [factura, lineas] of facturasMap.entries()) {
                let codigos = codigosMap[factura] || [];
                codigos = codigos.filter(c => c && String(c).trim() !== '');

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

            const allCodprodu = rows.map(r => r.CODPRODU);

            const descripcionProductos =
                await IntrastatModel.getDescripcionByCodproduList(allCodprodu);

            for (const [factura, lineas] of facturasMap.entries()) {
                if (lineas.length === 0) continue;

                const parsed = this.parseFactura(factura);
                if (!parsed) continue;

                const portesTotal = await IntrastatModel.getPortesByFactura(parsed);
                const portesPorLinea = Number((portesTotal / lineas.length).toFixed(2));

                let totalLineas = 0;

                for (const linea of lineas) {
                    const base = Number(linea[IMPORTE_FACTURADO_KEY]) || 0;

                    linea[PORTES_KEY] = portesPorLinea;

                    const totalLinea = Number((base + portesPorLinea).toFixed(2));
                    linea[IMPORTE_FACTURA_KEY] = totalLinea;

                    totalLineas += totalLinea;
                }

                totalLineas = Number(totalLineas.toFixed(2));

                let importeBaseBD = await IntrastatModel.getTotalFactura(parsed);
                importeBaseBD = Number(Number(importeBaseBD).toFixed(2));

                let diferencia = Number((importeBaseBD - totalLineas).toFixed(2));
                const ajusteMaximo = 0.04;

                if (Math.abs(diferencia) <= ajusteMaximo && lineas.length > 0) {
                    const ultimaLinea = lineas[lineas.length - 1];
                    const importeActual = Number(ultimaLinea[IMPORTE_FACTURA_KEY]) || 0;
                    const nuevoImporte = Number((importeActual + diferencia).toFixed(2));

                    ultimaLinea[IMPORTE_FACTURA_KEY] = nuevoImporte;
                    ultimaLinea.AJUSTE_REDONDEO = diferencia;

                    totalLineas = Number((totalLineas + diferencia).toFixed(2));
                    diferencia = Number((importeBaseBD - totalLineas).toFixed(2));
                }

                if (diferencia !== 0) {
                    erroresFacturas.push({
                        factura,
                        totalExcel: totalLineas,
                        totalBD: importeBaseBD,
                        diferencia
                    });

                    lineas.forEach(l => {
                        l.ERROR_FACTURA = `DESCUADRE (${diferencia})`;
                    });
                }
            }

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = normalizeFacturaKey(facturaRaw);
                const km = kilometrosMap[factura];

                row.KM_ESPANA = km?.kmsedehastacliente || '';
                row.KM_FRONTERA = km?.kmfronteraalcliente || '';
            }

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = normalizeFacturaKey(facturaRaw);
                const incotermData = incotermsMap[factura] || {};

                row.CODINCOTERMS = incotermData.codincoterms || '';
                row.INCOTERMS = incotermData.codintrastat || '';
                row['Modo de transporte'] = incotermData.modoTransporte || '';
            }

            for (const row of rows) {
                const cod = String(row.CODPRODU || '').trim().toUpperCase();
                row.DESCRIPCION_MERCANCIA = descripcionProductos[cod] || '';
            }

            const facturasIvaIncorrecto =
                await IntrastatModel.getFacturasConIvaIncorrectoByList(facturasList);

            rows.forEach(r => {
                if (!('KM_ESPANA' in r)) r.KM_ESPANA = '';
                if (!('KM_FRONTERA' in r)) r.KM_FRONTERA = '';
                if (!('INCOTERMS' in r)) r.INCOTERMS = '';
                if (!('CODINCOTERMS' in r)) r.CODINCOTERMS = '';
                if (!('Modo de transporte' in r)) r['Modo de transporte'] = '';
                if (!('ERROR_FACTURA' in r)) r.ERROR_FACTURA = '';
                if (!('AJUSTE_REDONDEO' in r)) r.AJUSTE_REDONDEO = '';
                if (!('AGREGADA_POR_FACTURA_MES' in r)) r.AGREGADA_POR_FACTURA_MES = '';
                if (!('DESCRIPCION_MERCANCIA' in r)) r.DESCRIPCION_MERCANCIA = '';
                if (!('CODPRODU' in r)) r.CODPRODU = '';
            });

            const sortedRows = this.sortRowsByFactura(rows);
            const outputRows = this.formatVentasOutputRows(sortedRows);
            const headers = this.getVentasOutputHeaders();

            const newSheet = XLSX.utils.json_to_sheet(outputRows, { header: headers });

            this.applyVentasFacturaZebraStyle(newSheet, outputRows, headers);

            const newWorkbook = XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Intrastat');

            const buffer = XLSX.write(newWorkbook, {
                bookType: 'xlsx',
                type: 'buffer'
            });

            return res.json({
                fileName: `intrastat_${Date.now()}.xlsx`,
                fileBase64: buffer.toString('base64'),
                errores: erroresFacturas,
                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error('ERROR INTRASTAT VENTAS:', error);

            return res.status(500).json({
                error: error.message || 'Error generating intrastat',
                detail: error.detail || '',
                code: error.code || '',
            });
        }
    }

    async generarCompras(req, res, rows) {
        try {
            const mesIntrastat = req.body.mesIntrastat || '';

            const FACTURA_KEY = this.getColumnKey(rows, 'FACTURA');
            let PORTES_KEY = this.getColumnKey(rows, 'PORTES');
            let IMPORTE_FACTURA_KEY = this.getColumnKey(rows, 'IMPORTE FACTURA');
            let PAIS_DESTINO_KEY = this.getColumnKey(rows, 'PAIS DESTINO');

            const IMPORTE_FACTURADO_KEY =
                this.getColumnKey(rows, 'IMPORTE FACTURADO');

            const CODPRODU_KEY =
                this.getColumnKey(rows, 'CODPRODU');

            if (!PORTES_KEY) {
                PORTES_KEY = 'PORTES';
                rows.forEach(r => r[PORTES_KEY] = 0);
            }

            if (!IMPORTE_FACTURA_KEY) {
                IMPORTE_FACTURA_KEY = 'IMPORTE FACTURA';
                rows.forEach(r => r[IMPORTE_FACTURA_KEY] = 0);
            }

            if (!PAIS_DESTINO_KEY) {
                PAIS_DESTINO_KEY = 'PAIS DESTINO';
                rows.forEach(r => r[PAIS_DESTINO_KEY] = '');
            }

            if (CODPRODU_KEY) {
                rows = rows.filter(row => {
                    const codprodu = String(row[CODPRODU_KEY] || '')
                        .trim()
                        .toUpperCase();

                    return codprodu !== 'PORTES75';
                });
            }

            rows = rows.filter(row => {
                const base = Number(row[IMPORTE_FACTURADO_KEY]) || 0;
                return base !== 0;
            });

            const facturasMap = new Map();
            const facturasList = [];

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const parsed = this.parseFacturaCompra(facturaRaw);

                if (!parsed || !parsed.codserfaccompra) continue;

                const key = `${parsed.codserfaccompra}-${parsed.nfaccompra}`
                    .replace(/\s+/g, '')
                    .toUpperCase();

                if (!facturasMap.has(key)) {
                    facturasMap.set(key, []);
                    facturasList.push(parsed);
                }

                facturasMap.get(key).push(row);
            }

            const facturasCompraConIvaNoPermitido =
                await IntrastatModel.getFacturasCompraConIvaNoPermitidoByList({
                    facturasList,
                    codigosPermitidos: ['04', '16'],
                });

            const facturasCompraConIvaNoPermitidoSet = new Set(
                facturasCompraConIvaNoPermitido.map(factura =>
                    `${factura.codserfaccompra}-${factura.nfaccompra}`
                        .replace(/\s+/g, '')
                        .toUpperCase()
                )
            );

            rows = rows.filter(row => {
                const parsed = this.parseFacturaCompra(row[FACTURA_KEY]);

                if (!parsed || !parsed.codserfaccompra) {
                    return false;
                }

                const key = `${parsed.codserfaccompra}-${parsed.nfaccompra}`
                    .replace(/\s+/g, '')
                    .toUpperCase();

                return !facturasCompraConIvaNoPermitidoSet.has(key);
            });

            for (const factura of facturasCompraConIvaNoPermitidoSet) {
                facturasMap.delete(factura);
            }

            for (let index = facturasList.length - 1; index >= 0; index -= 1) {
                const factura = facturasList[index];

                const key = `${factura.codserfaccompra}-${factura.nfaccompra}`
                    .replace(/\s+/g, '')
                    .toUpperCase();

                if (facturasCompraConIvaNoPermitidoSet.has(key)) {
                    facturasList.splice(index, 1);
                }
            }

            if (mesIntrastat) {
                const facturasExistentes = Array.from(facturasMap.keys());

                const lineasFaltantes =
                    await IntrastatModel.getLineasComprasIntrastatFaltantesPorMes({
                        mesIntrastat,
                        facturasExistentes,
                    });

                for (const linea of lineasFaltantes) {
                    const facturaKey = `${linea.codserfaccompra}-${linea.nfaccompra}`
                        .replace(/\s+/g, '')
                        .toUpperCase();

                    const facturaVisible =
                        `${String(linea.codserfaccompra).trim()}-${String(linea.nfaccompra).trim()}`;

                    const nuevaRow = {
                        [FACTURA_KEY]: facturaVisible,
                        FACTURA: facturaVisible,

                        [IMPORTE_FACTURADO_KEY]:
                            Number(linea.importe_facturado || 0),

                        [IMPORTE_FACTURA_KEY]: 0,
                        [PORTES_KEY]: 0,

                        CODPRODU:
                            linea.codprodu || '',

                        'NIF VIES':
                            linea.nif_vies || '',

                        'ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)':
                            linea.codpais_proveedor || '',

                        PAIS:
                            linea.codpais_proveedor || '',

                        [PAIS_DESTINO_KEY]:
                            linea.codpais_proveedor || '',

                        'CODIGO DE LAS MERCANCÍAS ':
                            linea.codintrastat || '',

                        'UNIDADES SUPLEMENTARIAS':
                            Number(linea.unidades_suplementarias || 0),

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
                            codserfaccompra: String(linea.codserfaccompra).trim(),
                            nfaccompra: String(linea.nfaccompra).trim(),
                        });
                    }

                    facturasMap.get(facturaKey).push(nuevaRow);
                }
            }

            const facturasData =
                await IntrastatModel.getFacturasCompraByList(facturasList);

            const proveedores =
                await IntrastatModel.getProveedoresByFacturas(facturasList);

            const kms =
                await IntrastatModel.getKmByProveedores(
                    Object.keys(proveedores)
                );

            const codigosMap =
                await IntrastatModel.getLineasAlbaranCompraPorFactura(
                    facturasList
                );

            const ajustesMap =
                await IntrastatModel.getImportesExtraByFacturaCompra(
                    facturasList
                );

            const incotermsMap =
                await IntrastatModel.getIncotermsCompraByFacturaList(
                    facturasList
                );

            const facturasIvaIncorrecto =
                await IntrastatModel.getFacturasCompraConIvaIncorrectoByList(
                    facturasList
                );

            for (const [factura, lineas] of facturasMap.entries()) {
                let codigos = codigosMap[factura] || [];

                codigos = codigos.filter(c =>
                    c && String(c).trim() !== ''
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

            const allCodprodu = rows.map(r => r.CODPRODU);

            const descripcionProductos =
                await IntrastatModel.getDescripcionByCodproduList(
                    allCodprodu
                );

            const erroresFacturas = [];

            for (const [factura, lineas] of facturasMap.entries()) {
                if (lineas.length === 0) continue;

                const [serie, numero] = factura.split('-');

                const parsed = {
                    codserfaccompra: serie,
                    nfaccompra: numero
                };

                const portesFactura =
                    await IntrastatModel.getPortesByFacturaCompra(
                        parsed
                    );

                const portes75Total =
                    await IntrastatModel.getPortes75ByFacturaCompra(
                        parsed
                    );

                const portesTotal =
                    Number(portesFactura || 0) +
                    Number(portes75Total || 0);

                const portesPorLinea =
                    Number((portesTotal / lineas.length).toFixed(2));

                const ajusteExtra =
                    Number(ajustesMap[factura] || 0);

                if (ajusteExtra !== 0 && lineas.length > 0) {
                    const ultimaLinea =
                        lineas[lineas.length - 1];

                    const actual =
                        Number(
                            String(
                                ultimaLinea[IMPORTE_FACTURADO_KEY] || 0
                            ).replace(',', '.')
                        ) || 0;

                    ultimaLinea[IMPORTE_FACTURADO_KEY] =
                        Number(
                            (actual + ajusteExtra).toFixed(2)
                        );

                    ultimaLinea.AJUSTE_EXTRA = ajusteExtra;
                }

                let totalLineas = 0;

                for (const linea of lineas) {
                    const base =
                        Number(
                            String(
                                linea[IMPORTE_FACTURADO_KEY] || 0
                            ).replace(',', '.')
                        ) || 0;

                    linea[PORTES_KEY] = portesPorLinea;

                    const totalLinea =
                        Number(
                            (base + portesPorLinea).toFixed(2)
                        );

                    linea[IMPORTE_FACTURA_KEY] = totalLinea;

                    totalLineas += totalLinea;
                }

                totalLineas =
                    Number(totalLineas.toFixed(2));

                let totalBD =
                    await IntrastatModel.getTotalFacturaCompra(
                        parsed
                    );

                totalBD =
                    Number(Number(totalBD).toFixed(2));

                let diferencia =
                    Number(
                        (totalBD - totalLineas).toFixed(2)
                    );

                const ajusteMaximo = 0.04;

                if (
                    Math.abs(diferencia) <= ajusteMaximo
                    && lineas.length > 0
                ) {
                    const ultimaLinea =
                        lineas[lineas.length - 1];

                    const importeActual =
                        Number(
                            ultimaLinea[IMPORTE_FACTURA_KEY]
                        ) || 0;

                    const nuevoImporte =
                        Number(
                            (importeActual + diferencia).toFixed(2)
                        );

                    ultimaLinea[IMPORTE_FACTURA_KEY] =
                        nuevoImporte;

                    ultimaLinea.AJUSTE_REDONDEO =
                        diferencia;

                    totalLineas =
                        Number(
                            (totalLineas + diferencia).toFixed(2)
                        );

                    diferencia =
                        Number(
                            (totalBD - totalLineas).toFixed(2)
                        );
                }

                if (diferencia !== 0) {
                    erroresFacturas.push({
                        factura,
                        totalExcel: totalLineas,
                        totalBD,
                        diferencia
                    });

                    lineas.forEach(l => {
                        l.ERROR_FACTURA =
                            `DESCUADRE (${diferencia})`;
                    });
                }
            }

            for (const row of rows) {
                const parsed =
                    this.parseFacturaCompra(
                        row[FACTURA_KEY]
                    );

                if (!parsed || !parsed.codserfaccompra)
                    continue;

                const key =
                    `${parsed.codserfaccompra}-${parsed.nfaccompra}`
                        .replace(/\s+/g, '')
                        .toUpperCase();

                const factura = facturasData[key];

                const proveedor =
                    factura
                        ? proveedores[factura.codprove]
                        : null;

                if (factura) {
                    const codpais =
                        factura.codpais
                        || proveedor?.codpais
                        || '';

                    row.PAIS = codpais;
                    row[PAIS_DESTINO_KEY] = codpais;
                    row['ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'] = codpais;

                    const km = kms[factura.codprove];

                    row.KM_ESPANA =
                        km?.proveedorkmhastasede || '';

                    row.KM_FRONTERA =
                        km?.proveedorkmhastafronteraesp || '';
                }

                const incotermData =
                    incotermsMap[key] || {};

                row.INCOTERMS =
                    incotermData.codintrastat || '';

                row['Modo de transporte'] =
                    incotermData.modoTransporte || '';

                const cod =
                    String(row.CODPRODU || '')
                        .trim()
                        .toUpperCase();

                row.DESCRIPCION_MERCANCIA =
                    descripcionProductos[cod] || '';
            }

            rows.forEach(r => {
                if (!('KM_ESPANA' in r))
                    r.KM_ESPANA = '';

                if (!('KM_FRONTERA' in r))
                    r.KM_FRONTERA = '';

                if (!('PAIS DESTINO' in r))
                    r['PAIS DESTINO'] = '';

                if (!('ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)' in r))
                    r['ESTADO MIEMBRO DE PROCEDENCIA/DESTINO (A2)'] = '';

                if (!('INCOTERMS' in r))
                    r.INCOTERMS = '';

                if (!('Modo de transporte' in r))
                    r['Modo de transporte'] = '';

                if (!('ERROR_FACTURA' in r))
                    r.ERROR_FACTURA = '';

                if (!('AJUSTE_REDONDEO' in r))
                    r.AJUSTE_REDONDEO = '';

                if (!('AJUSTE_EXTRA' in r))
                    r.AJUSTE_EXTRA = '';

                if (!('AGREGADA_POR_FACTURA_MES' in r))
                    r.AGREGADA_POR_FACTURA_MES = '';

                if (!('DESCRIPCION_MERCANCIA' in r))
                    r.DESCRIPCION_MERCANCIA = '';

                if (!('CODPRODU' in r))
                    r.CODPRODU = '';

                if (!('ERROR_PRODUCTO' in r))
                    r.ERROR_PRODUCTO = '';

                if (!('FACTURA ABONO' in r))
                    r['FACTURA ABONO'] = '';

                if (!('PESO MEDIO EN FRA (KG)' in r))
                    r['PESO MEDIO EN FRA (KG)'] = '';
            });

            const sortedRows = this.sortRowsByFactura(rows);
            const headers = this.getComprasOutputHeaders();

            const outputRows = sortedRows.map(row => {
                const outputRow = {};

                for (const header of headers) {
                    outputRow[header] = row[header] ?? '';
                }

                return outputRow;
            });

            const newSheet =
                XLSX.utils.json_to_sheet(
                    outputRows,
                    { header: headers }
                );

            this.applyVentasFacturaZebraStyle(newSheet, outputRows, headers);

            const newWorkbook =
                XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                newWorkbook,
                newSheet,
                'Intrastat'
            );

            const buffer = XLSX.write(
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

                errores: erroresFacturas,

                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error('ERROR COMPRAS INTRASTAT:', error);

            return res.status(500).json({
                error: error.message || 'Error compras intrastat',
                detail: error.detail || '',
                code: error.code || '',
            });
        }
    }
}