// routes/equivproveRoutes.js
import { Router } from 'express';
import { EquivproveController } from '../controllers/equivproveController.js';

export const createEquivalenciasRouter = () => {
    const equivalenciasRouter = Router();

    equivalenciasRouter.get('/', EquivproveController.getAll);
    equivalenciasRouter.get('/search', EquivproveController.search);
    equivalenciasRouter.get('/searchCJMW', EquivproveController.searchCJMW);

    return equivalenciasRouter;
};
