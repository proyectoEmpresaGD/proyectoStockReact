import { Router } from 'express';
import multer from 'multer';
import { IntrastatController } from '../controllers/intrastat.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createIntrastatRouter = () => {
    const router = Router();
    const controller = new IntrastatController();

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { files: 1, fileSize: 12 * 1024 * 1024 },
        fileFilter(req, file, cb) {
            if (!/\.(xlsx|xls|xlsm)$/i.test(file.originalname || '')) {
                const error = new Error('Selecciona un archivo Excel (.xlsx, .xls o .xlsm).');
                error.status = 400;
                return cb(error);
            }
            return cb(null, true);
        },
    });

    router.use(requireRouteAccess('/intrastat', 'administrativo'));

    router.post(
        '/ventas',
        upload.single('file'),
        controller.generarVentas.bind(controller)
    );

    router.use((error, req, res, next) => {
        if (error instanceof multer.MulterError) {
            return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
                .json({ message: 'El Excel supera el límite de 12 MB o hay demasiados archivos.' });
        }
        if (error?.status === 400) return res.status(400).json({ message: error.message });
        return next(error);
    });

    return router;
};