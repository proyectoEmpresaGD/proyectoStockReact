// server/routes/notas.js
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import multer from "multer";
import { NotasController } from "../controllers/notas.js";

// Multer en memoria + límites + fileFilter (solo imágenes hasta 6MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes"), false);
    }
    cb(null, true);
  },
});

export const createNotasRouter = () => {
  const router = Router();
  const ctrl = new NotasController();

  // Todas las rutas protegidas
  router.use(authMiddleware);

  // Listado con soporte de q/limit/offset (opcional)
  router.get("/", ctrl.getAll.bind(ctrl));

  // Crear nota (hasta 3 imágenes)
  router.post("/", upload.array("imagenes", 3), ctrl.create.bind(ctrl));

  // Actualizar nota (hasta 3 imágenes)
  router.patch("/:id", upload.array("imagenes", 3), ctrl.update.bind(ctrl));

  // Eliminar nota
  router.delete("/:id", ctrl.delete.bind(ctrl));

  // Manejo básico de errores de multer en este router
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      // p. ej., límite de tamaño o de número de archivos
      return res.status(400).json({ error: err.message });
    }
    if (err && err.message === "Solo se permiten imágenes") {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });

  return router;
};
