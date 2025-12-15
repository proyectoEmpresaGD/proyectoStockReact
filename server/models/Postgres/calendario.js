// server/models/Postgres/calendario.js
import pool from "../../db/pool.js";

function assertPool() {
    if (!pool || typeof pool.query !== "function") {
        throw new Error("❌ Pool de Postgres no inicializado correctamente (pool.query no existe)");
    }
}

export class CalendarioModel {
    static async getCitasDeUsuario(userId) {
        if (!userId) {
            throw new Error("userId requerido");
        }

        assertPool();

        const { rows } = await pool.query(
            `
      SELECT id, descripcion, fecha
      FROM visitas
      WHERE created_by = $1 OR assigned_to = $1
      ORDER BY fecha ASC
      `,
            [userId]
        );

        return rows;
    }
}
