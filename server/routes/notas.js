import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import multer from "multer";
import { NotasController } from "../controllers/notas.js";

// Almacenamiento en memoria para tener file.buffer disponible
const upload = multer({ storage: multer.memoryStorage() });

export const createNotasRouter = () => {
  const router = Router();
  const ctrl = new NotasController();

  router.use(authMiddleware);

  router.get("/", ctrl.getAll.bind(ctrl));
  // <-- Cambiado 'imagenes[]' por 'imagenes' y puesto límite 3
  router.post(
    "/",
    upload.array("imagenes", 3),
    ctrl.create.bind(ctrl)
  );
  router.patch(
    "/:id",
    upload.array("imagenes", 3),
    ctrl.update.bind(ctrl)
  );
  router.delete("/:id", ctrl.delete.bind(ctrl));

  return router;
};