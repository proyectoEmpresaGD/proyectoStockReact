import { ProductModel } from '../models/Postgres/productos.js';
import { generarHTMLCatalogo } from '../services/html.js';
import { generarPDFdesdeHTML } from '../services/pdf.js';
import { otherFormatsByBrand } from '../services/formatos.js';
import fetch from 'node-fetch';
import fs from 'fs';
import { mantenimientoImages, usoImages, direccionLogos } from '../services/iconos.js';
import { parseStringPromise } from 'xml2js';

async function convertirImagenURLaBase64(url) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type');
    return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function extraerValores(valorCrudo) {
    if (!valorCrudo || typeof valorCrudo !== 'string') return [];

    // Si comienza con "<", lo tratamos como XML
    if (valorCrudo.trim().startsWith('<')) {
        try {
            const resultado = await parseStringPromise(valorCrudo);
            return resultado?.ArrayOfCmpAdiAdmValMultiples?.CmpAdiAdmValMultiples?.map(
                item => item?.Valor?.[0]
            ) || [];
        } catch (e) {
            console.error('❌ Error parseando XML:', e);
            return [];
        }
    }

    // Si no es XML, lo tratamos como lista separada por punto y coma
    return valorCrudo
        .split(/[,;]+/)
        .map(s => s.trim())
        .filter(Boolean);
}


export async function generarCatalogoPdf(req, res) {
    try {
        const marca = req.params.marca.toUpperCase();
        console.log('📦 Marca recibida:', marca);

        const productos = await ProductModel.getByMarca(marca);
        console.log('📦 Productos encontrados:', productos.length);

        const formatos = otherFormatsByBrand[marca] || { libros: [], otrosFormatos: [] };
        console.log('📘 Formatos:', formatos);

        const portadaURL = 'https://bassari.eu/IMAGENES%20TARIFA/PORTADA%20Y%20CONTRAPORTADA%20TARIFA/CJM_TARIFAS_PORTADA-rect.jpg';
        const ultimaURL = 'https://bassari.eu/IMAGENES%20TARIFA/PORTADA%20Y%20CONTRAPORTADA%20TARIFA/CJM_TARIFAS_CONTRAPORTADA.jpg';

        console.log('🖼️ Descargando portada...');
        const portadaBase64 = await convertirImagenURLaBase64(portadaURL);
        console.log('🖼️ Descargando contraportada...');
        const ultimaBase64 = await convertirImagenURLaBase64(ultimaURL);

        console.log('📥 Cargando iconos...');
        const iconos = {
            mantenimiento: await convertirLoteIconos(mantenimientoImages),
            uso: await convertirLoteIconos(usoImages),
            direccion: await convertirLoteIconos(direccionLogos)
        };

        console.log('📎 Iconos cargados:', Object.keys(iconos.uso).length, 'usos /', Object.keys(iconos.mantenimiento).length, 'mantenimientos');

        const productosProcesados = await Promise.all(productos.map(async (p, i) => {
            const mantenimiento = await extraerValores(p.mantenimiento);
            const uso = await extraerValores(p.uso);
            const direccion = await extraerValores(p.direcciontela);

            if (i === 0) console.log('📋 Producto de ejemplo procesado:', p.nombre, mantenimiento, uso, direccion);

            return {
                ...p,
                mantenimiento: mantenimiento.join(';'),
                uso: uso.join(';'),
                direcciontela: direccion[0] || ''
            };
        }));

        console.log('🛠️ Generando HTML...');
        const html = generarHTMLCatalogo({
            productos: productosProcesados,
            formatos,
            portadaBase64,
            ultimaBase64,
            marca,
            iconos
        });

        console.log('🧾 HTML generado con éxito');

        console.log('🖨️ Generando PDF...');
        const pdfBuffer = await generarPDFdesdeHTML(html);
        console.log('✅ PDF generado correctamente');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${marca}_catalogo.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);
    } catch (error) {
        console.error('❌ Error generando PDF:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Error generando el catálogo PDF' });
    }
}



// Función para convertir múltiples URLs a base64
const convertirLoteIconos = async (mapaOriginal) => {
    const resultado = {};
    for (const [clave, url] of Object.entries(mapaOriginal)) {
        if (url && url.trim()) {
            try {
                const response = await fetch(url);
                const buffer = await response.buffer();
                const tipo = response.headers.get('content-type');
                resultado[clave] = `data:${tipo};base64,${buffer.toString('base64')}`;
            } catch (e) {
                console.warn(`❌ Falló la conversión del icono "${clave}"`, e);
            }
        }
    }
    return resultado;
};