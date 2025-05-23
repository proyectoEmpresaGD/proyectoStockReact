import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pool } from '../db/pool.js';

const router = express.Router();
const IMAGES_DIR = path.join('C:/imagenes');

if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

router.post('/descargar-imagenes', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT codprodu, ficadjunto
      FROM imagenesocproductos
      WHERE LOWER(codclaarchivo) = 'buena'
    `);

        let descargadas = 0;
        for (const row of rows) {
            const { codprodu, ficadjunto } = row;

            if (!ficadjunto?.trim()) continue;

            const normalizedUrl = ficadjunto.startsWith('http') ? ficadjunto : `https://${ficadjunto}`;
            const encodedUrl = encodeURI(normalizedUrl);
            const extension = ficadjunto.toLowerCase().includes('.png') ? 'png' : 'jpg';
            const filename = `${codprodu}.${extension}`;
            const filepath = path.join(IMAGES_DIR, filename);

            // Ya existe → solo actualizar BD
            if (fs.existsSync(filepath)) {
                await pool.query(
                    `UPDATE imagenesocproductos 
           SET imagenexcel = $1 
           WHERE codprodu = $2 AND LOWER(codclaarchivo) = 'buena'`,
                    [filepath, codprodu]
                );
                continue;
            }

            try {
                const response = await axios.get(encodedUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                fs.writeFileSync(filepath, response.data);
                await pool.query(
                    `UPDATE imagenesocproductos 
           SET imagenexcel = $1 
           WHERE codprodu = $2 AND LOWER(codclaarchivo) = 'buena'`,
                    [filepath, codprodu]
                );
                descargadas++;
            } catch (err) {
                console.error(`❌ Error al descargar ${codprodu}: ${err.message}`);
            }
        }

        res.json({ message: `Proceso terminado. Imágenes nuevas: ${descargadas}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al descargar imágenes' });
    }
});

export default router;