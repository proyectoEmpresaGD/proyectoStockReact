import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import multer from "multer";
import { NotasController } from "../controllers/notas.js";

// Usa almacenamiento en memoria para acceder a file.buffer
const upload = multer({ storage: multer.memoryStorage() });

export const createNotasRouter = () => {
  const router = Router();
  const ctrl = new NotasController();

  router.use(authMiddleware);

  router.get("/", ctrl.getAll.bind(ctrl));
  router.post("/", upload.array("imagenes", 3), ctrl.create.bind(ctrl));
  router.patch("/:id", upload.array("imagenes", 3), ctrl.update.bind(ctrl));
  router.delete("/:id", ctrl.delete.bind(ctrl));

  return router;
};
