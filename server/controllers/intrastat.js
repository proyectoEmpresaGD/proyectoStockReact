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

    parseFactura(factura) {
        if (!factura) return null;

        const [serie, numero] = factura.split('-');

        return {
            codserfacventa: serie?.trim(),
            nfacventa: numero?.trim(),
        };
    }

    async generarVentas(req, res) {
        try {
            if (!req.file || !req.file.buffer) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows.length) {
                return res.status(400).json({ error: 'El archivo está vacío' });
            }

            let PORTES_KEY = this.getColumnKey(rows, 'PORTES');
            const IMPORTE_FACTURA_KEY = this.getColumnKey(rows, 'IMPORTE FACTURA');
            const IMPORTE_FACTURADO_KEY = this.getColumnKey(rows, 'IMPORTE FACTURADO');
            const FACTURA_KEY = this.getColumnKey(rows, 'FACTURA');

            if (!PORTES_KEY) {
                PORTES_KEY = 'PORTES';
                rows.forEach(r => r[PORTES_KEY] = 0);
            }

            // 🔥 1. ELIMINAR LÍNEAS CON IMPORTE 0 (CLAVE)
            rows = rows.filter(row => {
                const base = Number(row[IMPORTE_FACTURADO_KEY]) || 0;
                return base !== 0;
            });

            const facturasMap = new Map();
            const erroresFacturas = [];
            const facturasList = [];

            // 🔹 AGRUPAR FACTURAS
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

            // 🔹 LISTA FACTURAS
            for (const factura of facturasMap.keys()) {
                const parsed = this.parseFactura(factura);
                if (parsed) facturasList.push(parsed);
            }

            // 🔹 INCOTERMS
            const incotermsMap =
                await IntrastatModel.getIncotermsByFacturaList(facturasList);

            // 🔥 CODIGOS PRODUCTO (YA ALINEADOS)
            // 🔥 CODIGOS PRODUCTO (YA ALINEADOS)
            // 🔥 CODIGOS PRODUCTO (CORREGIDO)
            const codigosMap =
                await IntrastatModel.getCodigosProductoPorFactura(facturasList);

            for (const [factura, lineas] of facturasMap.entries()) {

                let codigos = codigosMap[factura] || [];

                // limpiar codigos vacíos
                codigos = codigos.filter(c => c && String(c).trim() !== '');

                // 🔥 ASIGNACIÓN DIRECTA (YA CUADRADA)
                // 🔥 SOLO ASIGNAR A LAS PRIMERAS N LÍNEAS
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

            // 🔹 PORTES + VALIDACIÓN
            for (const [factura, lineas] of facturasMap.entries()) {

                if (lineas.length === 0) continue;

                const parsed = this.parseFactura(factura);
                if (!parsed) continue;

                const portesTotal = await IntrastatModel.getPortesByFactura(parsed);

                const portesPorLinea =
                    Number((portesTotal / lineas.length).toFixed(2));

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

            // 🔹 KM CLIENTES
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

            // 🔹 INCOTERMS
            for (const row of rows) {
                const facturaRaw = row[FACTURA_KEY];
                if (!facturaRaw) continue;

                const factura = String(facturaRaw)
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');

                row.CODINCOTERMS = incotermsMap[factura] || '';
            }

            // 🔹 DESCRIPCIÓN
            for (const row of rows) {
                const cod = String(row.CODPRODU || '').trim().toUpperCase();
                row.DESCRIPCION_MERCANCIA = descripcionProductos[cod] || '';
            }

            // 🔹 IVA INCORRECTO
            const facturasIvaIncorrecto =
                await IntrastatModel.getFacturasConIvaIncorrectoByList(facturasList);

            rows.forEach(r => {
                if (!('KM_ESPANA' in r)) r.KM_ESPANA = '';
                if (!('KM_FRONTERA' in r)) r.KM_FRONTERA = '';
                if (!('CODINCOTERMS' in r)) r.CODINCOTERMS = '';
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
}