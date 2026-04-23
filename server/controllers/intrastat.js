import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IntrastatModel } from '../models/Postgres/intrastat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    async getByCodprodu(req, res) {
        try {
            const { codprodu } = req.params;

            const images = await ImagenModel.getByCodprodu({ codprodu });

            if (!images || images.length === 0) {
                return res.status(404).json({ message: 'No images found for product' });
            }

            // 🔥 CONSTRUIR URL REAL (AQUÍ ESTÁ LA CLAVE)
            const imagesWithUrl = images.map(img => ({
                ...img,
                url: img.ficadjunto
                    ? `https://bassari.eu/ImagenesTelasCjmw/${img.ficadjunto}`
                    : null
            }));

            return res.json(imagesWithUrl);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async generarVentas(req, res) {
        try {
            if (!req.file?.path) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const workbook = XLSX.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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

            // 🔥 1. OBTENER CODPRODU POR FACTURA (ORDENADO)
            const codigosMap =
                await IntrastatModel.getCodigosProductoPorFactura(facturasList);

            // 🔥 2. ASIGNAR CODPRODU A CADA FILA DEL EXCEL
            for (const [factura, lineas] of facturasMap.entries()) {

                const codigos = codigosMap[factura] || [];

                lineas.forEach((row, index) => {
                    row.CODPRODU = codigos[index] || '';
                });
            }

            // 🔥 3. OBTENER TODAS LAS REFERENCIAS
            const allCodprodu = rows.map(r => r.CODPRODU);

            // 🔥 4. MAPEAR DESCRIPCIONES
            const descripcionProductos =
                await IntrastatModel.getDescripcionByCodproduList(allCodprodu);

            // 🔹 PORTES + VALIDACIÓN
            for (const [factura, lineas] of facturasMap.entries()) {

                const parsed = this.parseFactura(factura);
                if (!parsed) continue;

                const portesTotal = await IntrastatModel.getPortesByFactura(parsed);

                const portesPorLinea = lineas.length > 0
                    ? Number((portesTotal / lineas.length).toFixed(2))
                    : 0;

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

            // 🔥 5. ASIGNAR DESCRIPCIÓN POR CODPRODU (CORRECTO)
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
                if (!('ERROR_FACTURA' in r)) r.ERROR_FACTURA = '';
                if (!('AJUSTE_REDONDEO' in r)) r.AJUSTE_REDONDEO = '';
                if (!('DESCRIPCION_MERCANCIA' in r)) r.DESCRIPCION_MERCANCIA = '';
                if (!('CODPRODU' in r)) r.CODPRODU = '';
            });

            const headers = Object.keys(rows[0]);
            const indexImporte = headers.findIndex(
                h => h.toUpperCase() === 'IMPORTE FACTURA'
            );

            if (!headers.includes('PORTES') && indexImporte !== -1) {
                headers.splice(indexImporte, 0, 'PORTES');
            }

            if (!headers.includes('CODPRODU')) {
                headers.push('CODPRODU');
            }

            if (!headers.includes('DESCRIPCION_MERCANCIA')) {
                headers.push('DESCRIPCION_MERCANCIA');
            }

            if (!headers.includes('AJUSTE_REDONDEO')) {
                headers.push('AJUSTE_REDONDEO');
            }

            if (!headers.includes('ERROR_FACTURA')) {
                headers.push('ERROR_FACTURA');
            }

            const newSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
            const newWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Intrastat');

            const uploadsDir = path.resolve(__dirname, '../uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

            const outputPath = path.resolve(uploadsDir, `intrastat_${Date.now()}.xlsx`);
            XLSX.writeFile(newWorkbook, outputPath);

            return res.json({
                fileUrl: `/uploads/${path.basename(outputPath)}`,
                errores: erroresFacturas,
                facturasIvaIncorrecto
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error generating intrastat' });
        }
    }
}