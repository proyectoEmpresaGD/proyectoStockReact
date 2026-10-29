import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { notesImageUpload, validateNoteImages, notesUploadError } from '../middlewares/notesImageUpload.js';
import { NotasController } from '../controllers/notas.js';
import { userHasAppRouteAccess } from '../utils/routeAccess.js';

const NOTE_ROLES = ['comercial', 'administracion'];

function requireNotesRole(req, res, next) {
    if (userHasAppRouteAccess(req.user, '/notas', NOTE_ROLES)) return next();
    return res.status(403).json({ error: 'No tienes permisos para utilizar las notas comerciales' });
}

export const createNotasRouter = () => {
    const router = Router();
    const controller = new NotasController();

    router.use(authMiddleware);
    router.use(requireNotesRole);
    router.get('/', controller.getAll.bind(controller));
    router.get('/:id', controller.getById.bind(controller));
    router.post('/', notesImageUpload.array('imagenes', 3), validateNoteImages, controller.create.bind(controller));
    router.patch('/:id', notesImageUpload.array('imagenes', 3), validateNoteImages, controller.update.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));

    router.use(notesUploadError);

    return router;
};
