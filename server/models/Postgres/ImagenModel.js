import { pool } from '../../db/pool.js';

export const ImagenModel = {
    async getImagenesBuena() {
        const { rows } = await pool.query(`
      SELECT codprodu, ficadjunto
      FROM imagenesocproductos
      WHERE LOWER(codclaarchivo) = 'buena'
    `);
        return rows;
    },

    async actualizarRutaImagenExcel(codprodu, ruta) {
        await pool.query(
            `UPDATE imagenesocproductos 
       SET imagenexcel = $1 
       WHERE codprodu = $2 AND LOWER(codclaarchivo) = 'buena'`,
            [ruta, codprodu]
        );
    }
};
