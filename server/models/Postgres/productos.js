import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class ProductModel {
  static async getAll({ CodFamil, CodSubFamil, limit = 20, offset = 0 }) {
    let query = 'SELECT * FROM productos';
    let params = [];

    if (CodFamil) {
      query += ' WHERE "codfamil" = $1';
      params.push(CodFamil);
    }

    if (CodSubFamil) {
      if (params.length > 0) {
        query += ' AND "codsubfamil" = $2';
      } else {
        query += ' WHERE "codsubfamil" = $1';
      }
      params.push(CodSubFamil);
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    try {
      const { rows } = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw new Error('Error fetching products');
    }
  }

  static async getAllProductos(CodFamil, CodSubFamil) {
    let query = 'SELECT * FROM productos';
    let params = [];

    if (CodFamil) {
      query += ' WHERE "codfamil" = $1';
      params.push(CodFamil);
    }

    if (CodSubFamil) {
      if (params.length > 0) {
        query += ' AND "codsubfamil" = $2';
      } else {
        query += ' WHERE "codsubfamil" = $1';
      }
      params.push(CodSubFamil);
    }

    try {
      const { rows } = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw new Error('Error fetching products');
    }
  }

  static async getById({ id }) {
    const { rows } = await pool.query('SELECT * FROM productos WHERE "codprodu" = $1;', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async create({ input }) {
    const { CodProdu, DesProdu, CodFamil, Comentario, UrlImagen } = input;

    const { rows } = await pool.query(
      `INSERT INTO productos ("codprodu", "desprodu", "codfamil", "comentario", "urlimagen")
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;`,
      [CodProdu, DesProdu, CodFamil, Comentario, UrlImagen]
    );

    return rows[0];
  }

  static async update({ id, input }) {
    const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(", ");
    const values = Object.values(input);

    const { rows } = await pool.query(
      `UPDATE productos SET ${fields} WHERE "codprodu" = $1 RETURNING *;`,
      [id, ...values]
    );

    return rows[0];
  }

  static async delete({ id }) {
    const { rows } = await pool.query('DELETE FROM productos WHERE "codprodu" = $1 RETURNING *;', [id]);
    return rows[0];
  }

  static async search({ query }) {
    try {
      const searchQuery = `
                SELECT * FROM productos
                WHERE "desprodu" ILIKE $1
            `;
      const values = [`%${query}%`];
      const { rows } = await pool.query(searchQuery, values);
      return rows;
    } catch (error) {
      console.error('Error searching products:', error);
      throw new Error('Error searching products');
    }
  }

  static async getByCodFamil(codfamil) {
    try {
      const { rows } = await pool.query('SELECT * FROM productos WHERE "codfamil" = $1;', [codfamil]);
      return rows;
    } catch (error) {
      console.error('Error fetching products by codfamil:', error);
      throw new Error('Error fetching products by codfamil');
    }
  }

  static async getFilters() {
    try {
      const { rows: brands } = await pool.query('SELECT DISTINCT codmarca FROM productos');
      const { rows: collections } = await pool.query('SELECT DISTINCT coleccion, codmarca FROM productos');
      const { rows: fabricTypes } = await pool.query('SELECT DISTINCT tipo FROM productos');
      const { rows: fabricPatterns } = await pool.query('SELECT DISTINCT estilo FROM productos');
      const { rows: martindaleValues } = await pool.query('SELECT DISTINCT martindale FROM productos');
      const { rows: usoValues } = await pool.query('SELECT DISTINCT uso FROM productos');
      const { rows: colors } = await pool.query('SELECT DISTINCT colorprincipal FROM productos');
      const { rows: tonalidades } = await pool.query('SELECT DISTINCT tonalidad FROM productos');

      return {
        brands: brands.map(b => b.codmarca),
        collections: collections.map(c => c.coleccion),
        fabricTypes: fabricTypes.map(f => f.tipo),
        fabricPatterns: fabricPatterns.map(f => f.estilo),
        martindaleValues: martindaleValues.map(m => m.martindale),
        usoValues: usoValues.map(u => u.uso),
        colors: colors.map(c => c.colorprincipal),
        tonalidades: tonalidades.map(t => t.tonalidad)
      };
    } catch (error) {
      console.error('Error fetching filters:', error);
      throw new Error('Error fetching filters');
    }
  }

  static async filter(filters) {
    let query = 'SELECT * FROM productos WHERE 1=1';
    let params = [];
    let index = 1;

    if (filters.brand && filters.brand.length > 0) {
      query += ` AND "codmarca" = ANY($${index++})`;
      params.push(filters.brand);
    }

    if (filters.color && filters.color.length > 0) {
      query += ` AND "colorprincipal" = ANY($${index++})`;
      params.push(filters.color);
    }

    if (filters.collection && filters.collection.length > 0) {
      query += ` AND "coleccion" = ANY($${index++})`;
      params.push(filters.collection);
    }

    if (filters.fabricType && filters.fabricType.length > 0) {
      query += ` AND "tipo" = ANY($${index++})`;
      params.push(filters.fabricType);
    }

    if (filters.fabricPattern && filters.fabricPattern.length > 0) {
      query += ` AND "estilo" = ANY($${index++})`;
      params.push(filters.fabricPattern);
    }

    if (filters.tonalidad && filters.tonalidad.length > 0) {
      query += ` AND "tonalidad" = ANY($${index++})`;
      params.push(filters.tonalidad);
    }

    if (filters.martindale && filters.martindale.length > 0) {
      query += ` AND "martindale" = ANY($${index++})`;
      params.push(filters.martindale);
    }

    if (filters.uso && filters.uso.length > 0) {
      query += ` AND "uso" = ANY($${index++})`;
      params.push(filters.uso);
    }

    try {
      const { rows } = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error filtering products:', error);
      throw new Error('Error filtering products');
    }
  }

  static async getLibrosExcluyendoTapillaYAcc() {
    try {
      const query = `
                SELECT *
                FROM productos
                WHERE desprodu ILIKE '%libro%'
                  AND desprodu NOT ILIKE '%tapilla%'
                  AND codmarca <> 'ACC'
            `;
      const { rows } = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('Error fetching filtered libros:', error);
      throw new Error('Error fetching filtered libros');
    }
  }

  static async getLibrosByMarca({ codmarca }) {
    try {
      const query = `
                SELECT *
                FROM productos
                WHERE "desprodu" ILIKE '%LIBRO%'
                AND "codmarca" = $1
                AND "desprodu" NOT ILIKE '%TAPILLA%'
            `;
      const { rows } = await pool.query(query, [codmarca]);
      return rows;
    } catch (error) {
      console.error('Error fetching libros by marca:', error);
      throw new Error('Error fetching libros by marca');
    }
  }

  static async filterByMarcaAndFilter({ codmarca, filter }) {
    try {
      const query = `
                SELECT * FROM productos
                WHERE "codmarca" = $1 AND "desprodu" ILIKE $2
                AND "codmarca" != 'ACC' AND "desprodu" NOT ILIKE '%tapilla%'
            `;
      const values = [codmarca, `%${filter}%`];
      const { rows } = await pool.query(query, values);
      return rows;
    } catch (error) {
      console.error('Error filtering products by marca and filter:', error);
      throw new Error('Error filtering products by marca and filter');
    }
  }
}
