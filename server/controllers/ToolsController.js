import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ImagenModel } from '../models/Postgres/ImagenModel.js';

const IMAGES_DIR = path.resolve('C:/imagenes');

if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

export class ToolsController {
    async descargarImagenes(req, res) {
        try {
            const imagenes = await ImagenModel.getImagenesBuena();
            let descargadas = 0;

            for (const { codprodu, ficadjunto } of imagenes) {
                if (!ficadjunto?.trim()) continue;

                const normalizedUrl = ficadjunto.startsWith('http') ? ficadjunto : `https://${ficadjunto}`;
                const encodedUrl = encodeURI(normalizedUrl);
                const extension = ficadjunto.toLowerCase().includes('.png') ? 'png' : 'jpg';
                const filename = `${codprodu}.${extension}`;
                const filepath = path.join(IMAGES_DIR, filename);

                if (fs.existsSync(filepath)) {
                    await ImagenModel.actualizarRutaImagenExcel(codprodu, filepath);
                    continue;
                }

                try {
                    const response = await axios.get(encodedUrl, {
                        responseType: 'arraybuffer',
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });

                    fs.writeFileSync(filepath, response.data);
                    await ImagenModel.actualizarRutaImagenExcel(codprodu, filepath);
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
    }
}
