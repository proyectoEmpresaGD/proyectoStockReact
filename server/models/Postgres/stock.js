import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class StockModel {

    static async getAll({ empresa, ejercicio }) {
        let query = `
            SELECT s.*, p.desprodu 
            FROM stock s
            LEFT JOIN productos p ON s.codprodu = p.codprodu
            WHERE s.codalmac = '00'
        `;
        let params = [];

        if (empresa) {
            query += ' AND s.empresa = $1';
            params.push(empresa);
        }

        if (ejercicio) {
            if (params.length > 0) {
                query += ' AND s.ejercicio = $2';
            } else {
                query += ' AND s.ejercicio = $1';
            }
            params.push(ejercicio);
        }

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async getById({ codprodu }) {
        const { rows } = await pool.query(`
            SELECT s.*, p.desprodu 
            FROM stock s
            LEFT JOIN productos p ON s.codprodu = p.codprodu
            WHERE s.codprodu = $1
        `, [codprodu]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodprodu({ codprodu }) {
        try {
            const { rows } = await pool.query(`
                SELECT s.*, p.desprodu 
                FROM stock s
                LEFT JOIN productos p ON s.codprodu = p.codprodu
                WHERE s.codprodu = $1
            `, [codprodu]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async create({ input }) {
        const { empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto } = input;

        const { rows } = await pool.query(`
            INSERT INTO stock (empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *;
        `, [empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto]);

        return rows[0];
    }

    static async update({ codprodu, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(", ");
        const values = Object.values(input);

        const { rows } = await pool.query(`
            UPDATE stock
            SET ${fields}
            WHERE codprodu = $1
            RETURNING *;
        `, [codprodu, ...values]);

        return rows[0];
    }

    static async delete({ codprodu }) {
        const { rows } = await pool.query('DELETE FROM stock WHERE codprodu = $1 RETURNING *;', [codprodu]);

        return rows[0];
    }

    static async getLowStockAlerts() {
        try {
            const query = `
                SELECT s.codprodu, s.stockactual, p.desprodu, p.coleccion
                FROM stock s
                LEFT JOIN productos p ON s.codprodu = p.codprodu
                WHERE s.codalmac = '00'
            `;
            const { rows } = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching low stock alerts:", error);
            throw new Error("Error fetching low stock alerts");
        }
    }

    static normalizeText(text = '') {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    // ✅ PARÁMETROS DE FILTRO (centralizado)
    static EXCLUDE_TERMS = [
        'QUALITY', 'TAPILLA', 'CUTTING', 'CUTTINGS', 'RIEL', 'RIELES', 'HERRAJES',
        'SOBRES', 'CARGO', 'RELLENO', 'CERTIFICADO', 'TRABAJOS', 'COJIN', 'CUBRE',
        'ESTOR', 'CAIDA', 'PLAID', 'CABECERO', 'ETAMIN', 'CARTULINA', 'PORTES',
        'COSTE DEL TRANSPORTE', 'MECANISMOS', 'BOLSAS', 'TUBOS', 'SERVILLETAS',
        'CONTRACT', 'COMISION', 'COLCHA', 'PERCHA', 'LIBRO', 'VARIOS', 'CARRE GAME',
        'LIENZO', 'BOLONIA', 'VARADERO', 'TAIGA', 'DUNE', 'ZAMFARA', 'SHIRA', 'CALCUTA',
        'POISON', 'TUNDRA', 'AGATA', 'CUARZO', 'DIAMANTE', 'SUEDER', 'SIDDHARTA', 'NOMAD',
        'HABITAT', 'GRAVITY', 'LUNAR', 'CANDIDA', 'BAMBU', 'PARLOUR', 'BENNELONG',
        'MACARENA', 'NIJAR', 'MOJACAR', 'LOSENGO', 'VELVETY', 'MENORCA', 'BAUPRES',
        'LOST ODISSEY', 'MEROPS', 'MARTINA', 'ORQUIDEA', 'GASHGAI', 'DAMASCO', 'DOVES',
        'SENES', 'ESPERANZA', 'INMACULADA', 'ATLAS', 'MIRROR', 'ANTILLA', 'ANTILLA VELVET',
        'LUMIERE', 'MIGRATION', 'NIMBOSILVA', 'PERSIAN MOOD', 'RINPA', 'SURIRI', 'XUBEC',
        'AHURA', 'IMPERIAL', 'KUKULCAN', 'MOIRE', 'MOREAU', 'PERRAULT', 'PUMMERIN',
        'TOPKAPI', 'TULUM', 'ZAHARA'
    ];
    static excludeRegex = new RegExp(`\\b(${StockModel.EXCLUDE_TERMS.join('|')})\\b`, 'i');

    static marcasTela = /^(CJM|HAR|BAS|ARE|FLA)/i;
    static colecciones = [
        'stratos', 'diamante', 'urban contemporary', 'revoltoso vol i', 'revoltoso vol ii'
    ];

    // ✅ FUNCION DE FILTRO
    static filterStockItems(allItems) {
        const telas = [];
        const libros = [];
        const perchas = [];

        for (const item of allItems) {
            const des = StockModel.normalizeText(item.desprodu || '');
            const codp = StockModel.normalizeText(item.codprodu || '');
            const cole = StockModel.normalizeText(item.coleccion || '');
            const stock = parseFloat(item.stockactual);

            if (StockModel.excludeRegex.test(des)) continue;

            // Telas
            if (
                stock < 30 &&
                StockModel.marcasTela.test(codp) &&
                (StockModel.colecciones.length === 0 || StockModel.colecciones.includes(cole))
            ) {
                telas.push(item);
                continue;
            }

            // Libros
            if (
                stock < 30 &&
                /(?:LIBRO|CARRE GAME)/i.test(des)
            ) {
                libros.push(item);
                continue;
            }

            // Perchas
            if (
                stock < 10 &&
                /PERCHA/i.test(des)
            ) {
                perchas.push(item);
                continue;
            }
        }

        telas.sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));
        libros.sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));
        perchas.sort((a, b) => a.desprodu.localeCompare(b.desprodu, 'es', { sensitivity: 'base' }));

        return { telas, libros, perchas };
    }

    // ✅ MÉTODO QUE LO HACE TODO
    static async getLowStockAlertsFiltered() {
        try {
            const query = `
        SELECT s.codprodu, s.stockactual, p.desprodu, COALESCE(p.coleccion, '') AS coleccion
        FROM stock s
        LEFT JOIN productos p ON s.codprodu = p.codprodu
        WHERE s.codalmac = '00'
      `;
            const { rows } = await pool.query(query);
            return StockModel.filterStockItems(rows);
        } catch (error) {
            console.error("Error in getLowStockAlertsFiltered:", error);
            throw new Error("Error fetching low stock alerts");
        }
    }


}