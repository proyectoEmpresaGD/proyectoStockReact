import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import { NotasController } from '../controllers/notas.js';

const NOTE_ROLES = new Set(['admin', 'comercial', 'administracion']);

function requireNotesRole(req, res, next) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (NOTE_ROLES.has(role)) return next();
    return res.status(403).json({ error: 'No tienes permisos para utilizar las notas comerciales' });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 3, fileSize: 6 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!/^image\//.test(file.mimetype)) return cb(new Error('Solo se permiten imágenes'), false);
        cb(null, true);
    },
});

export const createNotasRouter = () => {
    const router = Router();
    const controller = new NotasController();

    router.use(authMiddleware);
    router.use(requireNotesRole);
    router.get('/', controller.getAll.bind(controller));
    router.get('/:id', controller.getById.bind(controller));
    router.post('/', upload.array('imagenes', 3), controller.create.bind(controller));
    router.patch('/:id', upload.array('imagenes', 3), controller.update.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));

    router.use((error, req, res, next) => {
        if (error instanceof multer.MulterError || error?.message === 'Solo se permiten imágenes') {
            return res.status(400).json({ error: error.message });
        }
        return next(error);
    });

    return router;
};
