// controllers/libroController.js
import { LibroModel } from '../models/Postgres/libroModel.js';

export class LibroController {
    async getLibrosByCliente(req, res) {
        try {
            const { codclien } = req.params;
            const libros = await LibroModel.getLibrosByCliente(codclien);
            res.json(libros);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
