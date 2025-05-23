// routes/toolsRouter.js
import { Router } from 'express';
import { ToolsController } from '../controllers/ToolsController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // si deseas protegerlo

export const createToolsRouter = () => {
    const toolsRouter = Router();
    const toolsController = new ToolsController();

    // Opción: protegerlo con authMiddleware si solo admins deben poder usarlo
    toolsRouter.post(
        '/descargar-imagenes',
        // authMiddleware,  // descomenta si quieres que solo usuarios autenticados puedan usarlo
        toolsController.descargarImagenes.bind(toolsController)
    );

    return toolsRouter;
};
