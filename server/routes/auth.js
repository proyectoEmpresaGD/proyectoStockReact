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

export default authRouter;
