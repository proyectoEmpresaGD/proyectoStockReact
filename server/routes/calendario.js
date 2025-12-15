// server/routes/calendario.js
import { Router } from "express";
import { CalendarioController } from "../controllers/calendario.js";

export const createCalendarioRouter = () => {
    const router = Router();
    const ctrl = new CalendarioController();

    router.get("/", ctrl.getAll.bind(ctrl));

    return router;
};
