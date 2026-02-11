import pg from 'pg';
import dotenv from 'dotenv';
import { getSqlServerClient } from '../../db/sqlserverPool.js';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const CODALMAC_CERO_FILTER = "TRIM(COALESCE(s.codalmac::text, '')) IN ('0', '00')";

export class StockModel {
    // caches por BD (para no mezclar CJMW_Web con CJMW_202601)
    static sqlServerColsCacheByDb = new Map();     // dbName -> Set(cols)
    static sqlServerMovColsCacheByDb = new Map();  // dbName -> Set(cols)

    static SQLSERVER_MAX_PARAMS = 1800;
    static FECHA_FALLBACK_MAX_CODES = Number(process.env.FECHA_FALLBACK_MAX_CODES || 250);

    static normalizeCode(value) {
        return String(value ?? '').trim();
    }

    static chunkArray(arr = [], chunkSize = 1000) {
        const out = [];
        for (let i = 0; i < arr.length; i += chunkSize) out.push(arr.slice(i, i + chunkSize));
        return out;
    }

    static async getDatCompraColumns(poolSqlServer, datCompraDatabase) {
        const cacheKey = datCompraDatabase;
        if (StockModel.sqlServerColsCacheByDb.has(cacheKey)) return StockModel.sqlServerColsCacheByDb.get(cacheKey);

        const datCompraTable = process.env.DATACOMPRA_TABLE || 'ProveProdu_DatCompra';
        const colsQuery = `
      SELECT COLUMN_NAME
      FROM [${datCompraDatabase}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${datCompraTable}'
    `;

        const colsRes = await poolSqlServer.request().query(colsQuery);
        const cols = new Set(colsRes.recordset.map((r) => String(r.COLUMN_NAME || '').trim().toLowerCase()));
        StockModel.sqlServerColsCacheByDb.set(cacheKey, cols);
        return cols;
    }

    static async getMovStockPrevistosColumns(poolSqlServer, datCompraDatabase) {
        const cacheKey = datCompraDatabase;
        if (StockModel.sqlServerMovColsCacheByDb.has(cacheKey)) return StockModel.sqlServerMovColsCacheByDb.get(cacheKey);

        const movTable = process.env.MOV_STOCK_PREVISTOS_TABLE || 'PedCompra_Linea';
        const colsQuery = `
      SELECT COLUMN_NAME
      FROM [${datCompraDatabase}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${movTable}'
    `;

        const colsRes = await poolSqlServer.request().query(colsQuery);
        const cols = new Set(colsRes.recordset.map((r) => String(r.COLUMN_NAME || '').trim().toLowerCase()));
        StockModel.sqlServerMovColsCacheByDb.set(cacheKey, cols);
        return cols;
    }

    // --- DatCompra: PlaEntre + CantMinima ---
    static async getDatCompraMapByCodes(codes = []) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const datCompraDatabase = process.env.DATACOMPRA_DB_NAME || 'CJMW_202601';
        const client = await getSqlServerClient({ database: datCompraDatabase });
        if (!client) return new Map();
        const { pool: poolSqlServer, sql } = client;

        const datCompraTable = process.env.DATACOMPRA_TABLE || 'ProveProdu_DatCompra';
        const productCol = process.env.DATACOMPRA_PRODUCT_COLUMN || 'CodProdu';
        const leadTimeCol = process.env.DATACOMPRA_LEADTIME_COLUMN || 'PlaEntre';
        const minQtyCol = process.env.DATACOMPRA_MINQTY_COLUMN || 'CantMinima';

        try {
            await StockModel.getDatCompraColumns(poolSqlServer, datCompraDatabase);

            const map = new Map();
            const chunks = StockModel.chunkArray(normalizedCodes, StockModel.SQLSERVER_MAX_PARAMS);

            for (let c = 0; c < chunks.length; c++) {
                const chunk = chunks[c];
                const request = poolSqlServer.request();

                const inParams = chunk.map((code, i) => {
                    const p = `cod_${c}_${i}`;
                    request.input(p, sql.VarChar(100), code);
                    return `@${p}`;
                });

                const datCompraQuery = `
          SELECT
            LTRIM(RTRIM(CAST(dc.[${productCol}] AS varchar(100)))) AS codprodu,
            CAST(dc.[${leadTimeCol}] AS varchar(50)) AS plaentre,
            CAST(dc.[${minQtyCol}] AS varchar(50)) AS cantminima
          FROM [${datCompraDatabase}].[dbo].[${datCompraTable}] dc
          WHERE LTRIM(RTRIM(CAST(dc.[${productCol}] AS varchar(100)))) IN (${inParams.join(', ')})
        `;

                const datCompraRes = await request.query(datCompraQuery);
                for (const row of datCompraRes.recordset) {
                    const code = StockModel.normalizeCode(row.codprodu);
                    if (!code) continue;
                    if (!map.has(code)) {
                        map.set(code, { plaentre: row.plaentre || null, cantminima: row.cantminima || null });
                    }
                }
            }

            return map;
        } catch (error) {
            console.error('Error fetching DatCompra data from SQL Server:', error.message);
            return new Map();
        }
    }

    /**
     * ✅ FECHAS desde PedCompra_Linea (MAX(FecEntre) por producto)
     * - NO usa ORDER BY
     * - NO usa conversiones varchar->datetime
     * - Devuelve ISO 126: YYYY-MM-DDTHH:mm:ss
     */
    static async getFechaEstimadaMapByCodesFast(codes = []) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const datCompraDatabase = process.env.DATACOMPRA_DB_NAME || 'CJMW_202601';
        const client = await getSqlServerClient({ database: datCompraDatabase });
        if (!client) return new Map();
        const { pool: poolSqlServer, sql } = client;

        const movTable = process.env.MOV_STOCK_PREVISTOS_TABLE || 'PedCompra_Linea';
        const productCol = process.env.MOV_STOCK_PREVISTOS_PRODUCT_COLUMN || 'CodProdu';
        const fechaCol = process.env.MOV_STOCK_PREVISTOS_DATE_COLUMN || 'FecEntre';
        const almacCol = process.env.MOV_STOCK_PREVISTOS_ALMAC_COLUMN || null;
        const almacValue = process.env.MOV_STOCK_PREVISTOS_ALMAC_VALUE ?? null;

        try {
            const cols = await StockModel.getMovStockPrevistosColumns(poolSqlServer, datCompraDatabase);

            if (!cols.has(productCol.toLowerCase()) || !cols.has(fechaCol.toLowerCase())) {
                return new Map();
            }

            const hasAlmFilter =
                almacCol &&
                cols.has(String(almacCol).toLowerCase()) &&
                almacValue !== null &&
                almacValue !== undefined &&
                String(almacValue).trim() !== '';

            const map = new Map();

            const limited = normalizedCodes.slice(0, StockModel.FECHA_FALLBACK_MAX_CODES);
            const chunks = StockModel.chunkArray(limited, 400); // 400 va muy bien

            for (let c = 0; c < chunks.length; c++) {
                const chunk = chunks[c];
                const request = poolSqlServer.request();

                const inParams = chunk.map((code, i) => {
                    const p = `fc_${c}_${i}`;
                    request.input(p, sql.VarChar(100), code);
                    return `@${p}`;
                });

                let whereAlm = '';
                if (hasAlmFilter) {
                    request.input(`alm_${c}`, sql.VarChar(10), String(almacValue));
                    whereAlm = ` AND m.[${almacCol}] = @alm_${c}`;
                }

                const q = `
          SELECT
            LTRIM(RTRIM(CAST(m.[${productCol}] AS varchar(100)))) AS codprodu,
            CONVERT(varchar(19), MAX(m.[${fechaCol}]), 126) AS fecha_estimada
          FROM [${datCompraDatabase}].[dbo].[${movTable}] m
          WHERE LTRIM(RTRIM(CAST(m.[${productCol}] AS varchar(100)))) IN (${inParams.join(', ')})
          ${whereAlm}
          GROUP BY LTRIM(RTRIM(CAST(m.[${productCol}] AS varchar(100))))
        `;

                const res = await request.query(q);

                for (const row of res.recordset) {
                    const code = StockModel.normalizeCode(row.codprodu);
                    if (!code) continue;
                    map.set(code, row.fecha_estimada || null);
                }

                // asegurar null para los que no vengan
                for (const code of chunk) {
                    if (!map.has(code)) map.set(code, null);
                }
            }

            return map;
        } catch (error) {
            console.error('Error fetching Fecha Estimada from PedCompra_Linea:', error.message);
            return new Map();
        }
    }

    // ✅ /api/stock: NO calcular fecha aquí
    static async getAll({ empresa, ejercicio }) {
        let query = `
      SELECT s.*, p.desprodu
      FROM stock s
      LEFT JOIN productos p ON s.codprodu = p.codprodu
       WHERE ${CODALMAC_CERO_FILTER}
    `;
        const params = [];

        if (empresa) {
            query += ' AND s.empresa = $1';
            params.push(empresa);
        }

        if (ejercicio) {
            query += params.length ? ' AND s.ejercicio = $2' : ' AND s.ejercicio = $1';
            params.push(ejercicio);
        }

        try {
            const { rows } = await pool.query(query, params);

            const codproduList = rows.map((r) => r.codprodu);
            const datCompraMap = await StockModel.getDatCompraMapByCodes(codproduList);

            return rows.map((row) => {
                const code = StockModel.normalizeCode(row.codprodu);
                const extra = datCompraMap.get(code);

                return {
                    ...row,
                    fecha_estimada: null,
                    plaentre: extra?.plaentre || null,
                    cantminima: extra?.cantminima || null,
                };
            });
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    // ----------- el resto de tu archivo SIN CAMBIOS -----------
    static async getById({ codprodu }) {
        const { rows } = await pool.query(
            `
      SELECT s.*, p.desprodu 
      FROM stock s
      LEFT JOIN productos p ON s.codprodu = p.codprodu
      WHERE s.codprodu = $1
        AND ${CODALMAC_CERO_FILTER}
      `,
            [codprodu]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodprodu({ codprodu }) {
        try {
            const { rows } = await pool.query(
                `
        SELECT s.*, p.desprodu 
        FROM stock s
        LEFT JOIN productos p ON s.codprodu = p.codprodu
        WHERE s.codprodu = $1
          AND ${CODALMAC_CERO_FILTER}
        `,
                [codprodu]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async create({ input }) {
        const {
            empresa, ejercicio, codprodu,
            stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum,
            stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum,
            stockprevisto,
        } = input;

        const { rows } = await pool.query(
            `
      INSERT INTO stock (
        empresa, ejercicio, codprodu,
        stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum,
        stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum,
        stockprevisto
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,
        $18
      )
      RETURNING *;
      `,
            [
                empresa, ejercicio, codprodu,
                stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum,
                stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum,
                stockprevisto,
            ]
        );

        return rows[0];
    }

    static async update({ codprodu, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(', ');
        const values = Object.values(input);

        const { rows } = await pool.query(
            `
      UPDATE stock
      SET ${fields}
      WHERE codprodu = $1
      RETURNING *;
      `,
            [codprodu, ...values]
        );

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
       WHERE ${CODALMAC_CERO_FILTER}
      `;
            const { rows } = await pool.query(query);
            return rows;
        } catch (error) {
            console.error('Error fetching low stock alerts:', error);
            throw new Error('Error fetching low stock alerts');
        }
    }

    static normalizeText(text = '') {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

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
        'TOPKAPI', 'TULUM', 'ZAHARA',
    ];

    static _excludeRegex = null;
    static getExcludeRegex() {
        if (StockModel._excludeRegex) return StockModel._excludeRegex;
        const escaped = StockModel.EXCLUDE_TERMS.map((t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        StockModel._excludeRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
        return StockModel._excludeRegex;
    }

    static marcasTela = /^(CJM|HAR|BAS|ARE|FLA)/i;
    static colecciones = ['stratos', 'diamante', 'urban contemporary', 'revoltoso vol i', 'revoltoso vol ii'];

    static filterStockItems(allItems) {
        const telas = [];
        const libros = [];
        const perchas = [];
        const excludeRegex = StockModel.getExcludeRegex();

        for (const item of allItems) {
            const des = StockModel.normalizeText(item.desprodu || '');
            const codp = StockModel.normalizeText(item.codprodu || '');
            const cole = StockModel.normalizeText(item.coleccion || '');
            const stock = Number(item.stockactual);

            if (excludeRegex.test(des)) continue;

            if (
                Number.isFinite(stock) &&
                stock < 30 &&
                StockModel.marcasTela.test(codp) &&
                (StockModel.colecciones.length === 0 || StockModel.colecciones.includes(cole))
            ) {
                telas.push(item);
                continue;
            }

            if (Number.isFinite(stock) && stock < 30 && /(?:LIBRO|CARRE GAME)/i.test(des)) {
                libros.push(item);
                continue;
            }

            if (Number.isFinite(stock) && stock < 10 && /PERCHA/i.test(des)) {
                perchas.push(item);
                continue;
            }
        }

        telas.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));
        libros.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));
        perchas.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));

        return { telas, libros, perchas };
    }

    static async getLowStockAlertsFiltered() {
        try {
            const query = `
        SELECT s.codprodu, s.stockactual, p.desprodu, COALESCE(p.coleccion, '') AS coleccion
        FROM stock s
        LEFT JOIN productos p ON s.codprodu = p.codprodu
        WHERE ${CODALMAC_CERO_FILTER}
      `;
            const { rows } = await pool.query(query);
            return StockModel.filterStockItems(rows);
        } catch (error) {
            console.error('Error in getLowStockAlertsFiltered:', error);
            throw new Error('Error fetching low stock alerts');
        }
    }
}
