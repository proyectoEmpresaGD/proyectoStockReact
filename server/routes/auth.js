import { Router } from 'express';
import { AuthController } from '../controllers/auth.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import multer from 'multer';

const authRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

authRouter.post('/login', AuthController.login);
authRouter.post('/updateJornada', authMiddleware, AuthController.updateJornada); // Protegida con el middleware
authRouter.post('/logout', authMiddleware, AuthController.logout); // Protegida con el middleware
authRouter.post('/logoutAll', authMiddleware, AuthController.logoutAll); // Protegida con el middleware
authRouter.post('/heartbeat', authMiddleware, AuthController.heartbeat); // Protegida con el middleware
authRouter.post('/refresh', AuthController.refreshToken); // No necesita autenticación
authRouter.get('/users/commercial', authMiddleware, AuthController.getCommercialUsers);
authRouter.get('/me', authMiddleware, AuthController.getPerfilUsuario);
authRouter.get('/users', authMiddleware, requireAdmin, AuthController.getAllUsers);
authRouter.get('/roles-catalog', authMiddleware, AuthController.getRoleCatalog);
authRouter.get('/departamentos', authMiddleware, requireAdmin, AuthController.getDepartments);
authRouter.post('/departamentos', authMiddleware, requireAdmin, AuthController.createDepartment);
authRouter.post('/users/update-role', authMiddleware, requireAdmin, AuthController.updateRole);
authRouter.post('/users/create-with-image', authMiddleware, requireAdmin, upload.single('imagen'), AuthController.createUserWithImage);

authRouter.delete('/users/:id', authMiddleware, requireAdmin, AuthController.deleteUser);
authRouter.put('/users/:id', authMiddleware, AuthController.updateUser);
authRouter.post(
    '/users/:id/upload-imagenperfil',
    authMiddleware,
    requireAdmin,
    upload.single('imagen'),
    AuthController.uploadImagenPerfilById
);


export default authRouter;
