// server/controllers/calendario.js
import { CalendarioModel } from "../models/Postgres/calendario.js";

export class CalendarioController {
    async getAll(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: "No autenticado" });

            const citas = await CalendarioModel.getCitasDeUsuario(userId);
            return res.json(citas);
        } catch (err) {
            console.error("💥 Error en getAll calendario:", err);
            return res.status(500).json({ error: "Error obteniendo calendario" });
        }
    }
}
