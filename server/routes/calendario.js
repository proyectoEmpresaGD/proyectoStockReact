import { Router } from "express";
import { CalendarioController } from "../controllers/calendario.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const createCalendarioRouter = () => {
    const router = Router();
    const ctrl = new CalendarioController();

    // Todas requieren usuario autenticado
    router.use(authMiddleware);

    router.get("/", ctrl.getAll.bind(ctrl));
    router.post("/", ctrl.create.bind(ctrl));
    router.delete("/:id", ctrl.delete.bind(ctrl));

    return router;
};
