import { Router } from 'express';
import { AuthController } from '../controllers/auth.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware

const authRouter = Router();

authRouter.post('/login', AuthController.login);
authRouter.post('/updateJornada', authMiddleware, AuthController.updateJornada); // Protegida con el middleware
authRouter.post('/logout', authMiddleware, AuthController.logout); // Protegida con el middleware
authRouter.post('/logoutAll', authMiddleware, AuthController.logoutAll); // Protegida con el middleware
authRouter.post('/heartbeat', authMiddleware, AuthController.heartbeat); // Protegida con el middleware
authRouter.post('/refresh', AuthController.refreshToken); // No necesita autenticación
authRouter.get('/users/commercial', authMiddleware, AuthController.getCommercialUsers);
authRouter.get('/me', authMiddleware, AuthController.getPerfilUsuario);
authRouter.get('/users', authMiddleware, AuthController.getAllUsers);
authRouter.post('/users/update-role', authMiddleware, AuthController.updateRole);
authRouter.post('/users/create', authMiddleware, AuthController.createUser);
authRouter.delete('/users/:id', authMiddleware, AuthController.deleteUser);
authRouter.put('/users/:id', authMiddleware, AuthController.updateUser);


export default authRouter;
