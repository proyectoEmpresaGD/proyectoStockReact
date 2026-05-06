import XLSX from 'xlsx';
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

            const facturasMap = new Map();
            const erroresFacturas = [];
            const facturasList = [];

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = String(facturaRaw)
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');

                if (!facturasMap.has(factura)) {
                    facturasMap.set(factura, []);
                }

                facturasMap.get(factura).push(row);
            }

            for (const factura of facturasMap.keys()) {
                const parsed = this.parseFactura(factura);
                if (parsed) facturasList.push(parsed);
            }

            const incotermsMap =
                await IntrastatModel.getIncotermsByFacturaList(facturasList);

            const codigosMap =
                await IntrastatModel.getCodigosProductoPorFactura(facturasList);

            for (const [factura, lineas] of facturasMap.entries()) {
                let codigos = codigosMap[factura] || [];
                codigos = codigos.filter(c => c && String(c).trim() !== '');

                let cursor = 0;

                for (const row of lineas) {
                    if (cursor < codigos.length) {
                        row.CODPRODU = codigos[cursor];
                        cursor++;
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

                const parsed = this.parseFactura(factura); // ✅
                if (!parsed) continue;
                console.log('======================');
                console.log('FACTURA EXCEL:', factura);
                console.log('PARSED:', parsed);
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
                const nif = this.normalize(row['NIF VIES']);
                if (!nif) continue;

                const cliente = await IntrastatModel.getClienteByNif({ nif });
                if (!cliente) continue;

                const km = await IntrastatModel.getKmByCodclien({
                    codclien: cliente.codclien,
                });

                row.KM_ESPANA = km?.kmsedehastacliente || '';
                row.KM_FRONTERA = km?.kmfronteraalcliente || '';
            }

            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = String(facturaRaw)
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');

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
                if (!('Modo de transporte' in r)) r['Modo de transporte'] = '';
                if (!('ERROR_FACTURA' in r)) r.ERROR_FACTURA = '';
                if (!('AJUSTE_REDONDEO' in r)) r.AJUSTE_REDONDEO = '';
                if (!('DESCRIPCION_MERCANCIA' in r)) r.DESCRIPCION_MERCANCIA = '';
                if (!('CODPRODU' in r)) r.CODPRODU = '';
            });

            const headers = Object.keys(rows[0]);

            const newSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
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
            console.error(error);
            return res.status(500).json({ error: 'Error generating intrastat' });
        }
    }

    async generarCompras(req, res, rows) {
        try {

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

            // =========================
            // ELIMINAR PORTES75
            // =========================
            if (CODPRODU_KEY) {
                rows = rows.filter(row => {

                    const codprodu = String(row[CODPRODU_KEY] || '')
                        .trim()
                        .toUpperCase();

                    return codprodu !== 'PORTES75';
                });
            }

            // =========================
            // ELIMINAR IMPORTES 0
            // =========================
            rows = rows.filter(row => {
                const base = Number(row[IMPORTE_FACTURADO_KEY]) || 0;
                return base !== 0;
            });

            // =========================
            // MAP FACTURAS
            // =========================
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

            // =========================
            // DATOS BD
            // =========================
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

            // 🔥 NUEVO
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

            // =========================
            // ASIGNAR PRODUCTOS
            // =========================
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

            // =========================
            // DESCRIPCIONES
            // =========================
            const allCodprodu = rows.map(r => r.CODPRODU);

            const descripcionProductos =
                await IntrastatModel.getDescripcionByCodproduList(
                    allCodprodu
                );

            // =========================
            // PORTES + CUADRE
            // =========================
            const erroresFacturas = [];

            for (const [factura, lineas] of facturasMap.entries()) {

                if (lineas.length === 0) continue;

                const [serie, numero] = factura.split('-');

                const parsed = {
                    codserfaccompra: serie,
                    nfaccompra: numero
                };

                // =========================
                // PORTES
                // =========================
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

                // =========================
                // AJUSTES SIN PRODUCTO
                // =========================
                const ajusteExtra =
                    Number(ajustesMap[factura] || 0);

                console.log('AJUSTES MAP', ajustesMap);
                console.log('FACTURA', factura);
                console.log('AJUSTE FACTURA', ajustesMap[factura]);

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

                // =========================
                // CALCULO LINEAS
                // =========================
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

                // =========================
                // TOTAL BD
                // =========================
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

                // =========================
                // AJUSTE REDONDEO
                // =========================
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

                // =========================
                // DESCUADRES
                // =========================
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

            // =========================
            // DATOS EXTRA
            // =========================
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

            // =========================
            // NORMALIZAR COLUMNAS
            // =========================
            rows.forEach(r => {

                if (!('KM_ESPANA' in r))
                    r.KM_ESPANA = '';

                if (!('KM_FRONTERA' in r))
                    r.KM_FRONTERA = '';

                if (!('PAIS DESTINO' in r))
                    r['PAIS DESTINO'] = '';

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

                if (!('DESCRIPCION_MERCANCIA' in r))
                    r.DESCRIPCION_MERCANCIA = '';

                if (!('CODPRODU' in r))
                    r.CODPRODU = '';
            });

            // =========================
            // EXCEL
            // =========================
            const headers = Object.keys(rows[0]);

            const newSheet =
                XLSX.utils.json_to_sheet(
                    rows,
                    { header: headers }
                );

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

            console.error(error);

            return res.status(500).json({
                error: 'Error compras intrastat'
            });
        }
    }
}