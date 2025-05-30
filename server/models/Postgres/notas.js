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
  static async getAll({ offset, limit, query }) {
    let text = 'SELECT * FROM notas WHERE 1=1';
    const params = [];
    if (query) {
      text += ` AND contenido ILIKE $${params.length + 1}`;
      params.push(`%${query}%`);
    }
    text += ` ORDER BY fecha_creacion DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const { rows } = await pool.query(text, params);
    return rows;
  }

  static async getCount({ query }) {
    let text = 'SELECT COUNT(*) FROM notas WHERE 1=1';
    const params = [];
    if (query) {
      text += ` AND contenido ILIKE $${params.length + 1}`;
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
    const { titulo, contenido, idusuario } = input;
    const { rows } = await pool.query(
      `INSERT INTO notas (titulo, contenido, idusuario)
       VALUES ($1, $2, $3) RETURNING *;`,
      [titulo, contenido, idusuario]
    );
    return rows[0];
  }

  static async update({ id, input }) {
    const keys = Object.keys(input);
    const setClause = keys
      .map((k, i) => `"${k}" = $${i + 2}`)
      .join(', ');
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
}
