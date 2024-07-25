// models/Postgres/libroModel.js
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class LibroModel {
    static async getLibrosByCliente(codclien) {
        try {
            const query = `
                SELECT p.codprodu, p.desprodu, p.codmarca, COALESCE(pv.cantidad, 0) as cantidad_comprada
                FROM productos p
                LEFT JOIN (
                    SELECT codprodu, SUM(cantidad) as cantidad
                    FROM pedventa
                    WHERE codclien = $1
                    GROUP BY codprodu
                ) pv ON p.codprodu = pv.codprodu
                WHERE p.desprodu ILIKE '%LIBRO%'
                ORDER BY p.codmarca, p.desprodu;
            `;
            const { rows } = await pool.query(query, [codclien]);
            return rows;
        } catch (error) {
            console.error('Error fetching libros by cliente:', error);
            throw new Error('Error fetching libros by cliente');
        }
    }
}
