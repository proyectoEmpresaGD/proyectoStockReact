import { Router } from 'express';
import { AuthController } from '../controllers/auth.js';

const authRouter = Router();

authRouter.post('/login', AuthController.login);
authRouter.post('/updateJornada', AuthController.updateJornada);
authRouter.post('/logout', AuthController.logout);

export default authRouter;
