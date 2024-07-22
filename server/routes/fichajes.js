import { Router } from 'express';
import { FichajeController } from '../controllers/fichajes.js';

const fichajeRouter = Router();
const fichajeController = new FichajeController();

fichajeRouter.get('/fichajes', fichajeController.getAll.bind(fichajeController));
fichajeRouter.post('/fichajes', fichajeController.create.bind(fichajeController));

export default fichajeRouter;
