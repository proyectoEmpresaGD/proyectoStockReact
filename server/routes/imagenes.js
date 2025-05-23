import { Router } from 'express';
import { ImagenController } from '../controllers/imagenes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createImagenRouter = () => {
    const imagenRouter = Router();
    const imagenController = new ImagenController();

    // ✅ Ruta pública para servir imágenes por codprodu sin autenticación
    imagenRouter.get('/public/:codprodu', async (req, res) => {
        const { codprodu } = req.params;

        try {
            const { rows } = await pool.query(`
    SELECT ficadjunto
    FROM imagenesocproductos
    WHERE codprodu = $1 AND LOWER(codclaarchivo) = 'buena'
    LIMIT 1
    `, [codprodu]);

            if (!rows.length || !rows[0].ficadjunto) {
                return res.status(404).send('Imagen no encontrada');
            }

            const mimeType = rows[0].extension === 'png' ? 'image/png' : 'image/jpeg';
            res.setHeader('Content-Type', mimeType);
            res.send(rows[0].ficadjunto);
        } catch (error) {
            console.error('❌ Error al servir imagen pública:', error);
            res.status(500).send('Error al servir imagen');
        }
    });

    imagenRouter.post('/descargar-imagenes', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // solo admin puede descargar imágenes
        next();
    }, imagenController.descargarImagenes.bind(imagenController));

    // Rutas para la gestión de imágenes, protegidas solo para 'admin'
    imagenRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede acceder a todas las imágenes
        next();
    }, imagenController.getAll.bind(imagenController));

    imagenRouter.post('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede crear imágenes
        next();
    }, imagenController.create.bind(imagenController));

    // Rutas para operaciones específicas de una imagen, protegidas solo para 'admin'
    imagenRouter.get('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede ver imágenes específicas
        next();
    }, imagenController.getByCodproduAndCodclaarchivo.bind(imagenController));

    imagenRouter.patch('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede modificar imágenes
        next();
    }, imagenController.update.bind(imagenController));

    imagenRouter.delete('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede eliminar imágenes
        next();
    }, imagenController.delete.bind(imagenController));

    return imagenRouter;
};
