import { Router } from 'express';
import { AuthController } from '../controllers/auth.js';

const authRouter = Router();

authRouter.post('/login', AuthController.login);
authRouter.post('/updateJornada', AuthController.updateJornada);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/logoutAll', AuthController.logoutAll);
authRouter.post('/heartbeat', AuthController.heartbeat); // Nueva ruta para el heartbeat

export default authRouter;
