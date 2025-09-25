// server/model/Postgres/notas.js
import dotenv from 'dotenv';
dotenv.config();
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

export class NotasModel {
  // ✅ getAll: ahora acepta idusuario (opcional) y busca también por título
  static async getAll({ offset = 0, limit = 100, query = null, idusuario = null }) {
    let text = 'SELECT * FROM notas WHERE 1=1';
    const params = [];

    if (idusuario != null) {
      text += ` AND idusuario = $${params.length + 1}`;
      params.push(idusuario);
    }

    if (query) {
      // Busca en contenido (como antes) y también en título
      text += ` AND (titulo ILIKE $${params.length + 1} OR contenido ILIKE $${params.length + 1})`;
      params.push(`%${query}%`);
    }

    text += ` ORDER BY fechacreado DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(text, params);
    return rows;
  }


  // ✅ getCount: idem a getAll, con idusuario (opcional) y búsqueda por título o contenido
  static async getCount({ query = null, idusuario = null }) {
    let text = 'SELECT COUNT(*) FROM notas WHERE 1=1';
    const params = [];

    if (idusuario != null) {
      text += ` AND idusuario = $${params.length + 1}`;
      params.push(idusuario);
    }

    if (query) {
      text += ` AND (titulo ILIKE $${params.length + 1} OR contenido ILIKE $${params.length + 1})`;
      params.push(`%${query}%`);
    }

    const { rows } = await pool.query(text, params);
    return parseInt(rows[0].count, 10);
  }


  static async getById({ id }) {
    const { rows } = await pool.query('SELECT * FROM notas WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async create({ input }) {
    const { titulo, contenido, idusuario, eventos = [] } = input;
    const { rows } = await pool.query(
      `INSERT INTO notas (titulo, contenido, idusuario, eventos)
       VALUES ($1, $2, $3, $4) RETURNING *;`,
      [titulo, contenido, idusuario, eventos]
    );
    return rows[0];
  }

  static async update({ id, input }) {
    const keys = Object.keys(input);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const values = Object.values(input);
    const { rows } = await pool.query(
      `UPDATE notas SET ${setClause} WHERE id = $1 RETURNING *;`,
      [id, ...values]
    );
    return rows[0];
  }

  static async delete({ id }) {
    const { rows } = await pool.query(
      'DELETE FROM notas WHERE id = $1 RETURNING *;',
      [id]
    );
    return rows[0];
  }

  static async getCitasDeUsuario(userId) {
    if (!userId) {
      console.error('❌ getCitasDeUsuario llamado sin userId');
      throw new Error('userId requerido');
    }

    const { rows } = await pool.query(
      `SELECT id, descripcion, fecha FROM visitas WHERE created_by = $1 OR assigned_to = $1 ORDER BY fecha ASC`,
      [userId]
    );
    return rows;
  }
}
