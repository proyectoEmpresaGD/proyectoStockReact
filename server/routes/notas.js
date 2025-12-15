// server/routes/notas.js
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import multer from "multer";
import { NotasController } from "../controllers/notas.js";

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

  router.options("*", (req, res) => res.sendStatus(204));

  router.use(authMiddleware);

  router.get("/", ctrl.getAll.bind(ctrl));
  router.post("/", upload.array("imagenes", 3), ctrl.create.bind(ctrl));
  router.patch("/:id", upload.array("imagenes", 3), ctrl.update.bind(ctrl));
  router.delete("/:id", ctrl.delete.bind(ctrl));

  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err && err.message === "Solo se permiten imágenes") {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });

  return router;
};
