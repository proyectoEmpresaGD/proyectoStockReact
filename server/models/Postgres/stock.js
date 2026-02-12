import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// acepta 0, 00, 000, etc.
const CODALMAC_CERO_FILTER = "TRIM(COALESCE(s.codalmac::text, '')) ~ '^0+$'";

const sanitizeTableName = (name, fallback) => {
    const value = String(name || fallback).trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) return fallback;
    return value;
};

const sanitizeIdentifier = (name) => {
    const value = String(name || '').trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(value)) return null;
    return value.toLowerCase();
};

const quoteIdent = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

export class StockModel {
    static FECHA_FALLBACK_MAX_CODES = Number(process.env.FECHA_FALLBACK_MAX_CODES || 250);
    static pgColsCacheByTable = new Map();

    static normalizeCode(value) {
        return String(value ?? '').trim();
    }

    // Canonicaliza códigos tipo ARE000123 -> ARE123 (uppercase + quita ceros a la izquierda del tramo numérico)
    static normalizeCodeCanonical(value) {
        const raw = StockModel.normalizeCode(value).toUpperCase();
        const m = raw.match(/^([A-Z]+)(\d+)$/);
        if (!m) return raw;
        const prefix = m[1];
        const numeric = String(Number(m[2]));
        return `${prefix}${numeric}`;
    }

    static chunkArray(arr = [], chunkSize = 1000) {
        const out = [];
        for (let i = 0; i < arr.length; i += chunkSize) out.push(arr.slice(i, i + chunkSize));
        return out;
    }

    static async getTableColumns(tableName) {
        const table = sanitizeTableName(tableName, tableName);
        if (StockModel.pgColsCacheByTable.has(table)) {
            return StockModel.pgColsCacheByTable.get(table);
        }

        const { rows } = await pool.query(
            `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `,
            [table]
        );

        const cols = new Set(rows.map((r) => String(r.column_name || '').trim().toLowerCase()).filter(Boolean));
        StockModel.pgColsCacheByTable.set(table, cols);
        return cols;
    }

    static pickColumn(cols, configured, fallbacks = []) {
        const conf = sanitizeIdentifier(configured);
        if (conf && cols.has(conf)) return conf;

        for (const fallback of fallbacks) {
            const f = sanitizeIdentifier(fallback);
            if (f && cols.has(f)) return f;
        }

        return null;
    }

    // --- DatCompra desde PostgreSQL: PlaEntre + CantMinima ---
    static async getDatCompraMapByCodes(codes = []) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const datCompraTable = sanitizeTableName(process.env.DATACOMPRA_TABLE, 'proveprodu_datcompra');
        const maxCodes = Number(process.env.DATACOMPRA_MAX_CODES || 4000);

        try {
            const cols = await StockModel.getTableColumns(datCompraTable);
            const productCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_PRODUCT_COLUMN, ['codprodu', 'cod_produ']);
            const leadTimeCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_LEADTIME_COLUMN, [
                'plaentre',
                'plazoentrega',
            ]);
            const minQtyCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_MINQTY_COLUMN, [
                'cantminima',
                'cantidadminima',
            ]);

            if (!productCol) return new Map();

            const map = new Map();
            const limited = normalizedCodes.slice(0, maxCodes);
            const chunks = StockModel.chunkArray(limited, 1000);

            for (const chunk of chunks) {
                const { rows } = await pool.query(
                    `
          SELECT
            TRIM(COALESCE(dc.${quoteIdent(productCol)}::text, '')) AS codprodu,
            ${leadTimeCol ? `dc.${quoteIdent(leadTimeCol)}::text` : `NULL::text`} AS plaentre,
            ${minQtyCol ? `dc.${quoteIdent(minQtyCol)}::text` : `NULL::text`} AS cantminima
          FROM ${quoteIdent(datCompraTable)} dc
          WHERE TRIM(COALESCE(dc.${quoteIdent(productCol)}::text, '')) = ANY($1)
        `,
                    [chunk]
                );

                for (const row of rows) {
                    const code = StockModel.normalizeCode(row.codprodu);
                    if (!code || map.has(code)) continue;
                    map.set(code, {
                        plaentre: row.plaentre || null,
                        cantminima: row.cantminima || null,
                    });
                }
            }

            return map;
        } catch (error) {
            console.error('Error fetching DatCompra data from PostgreSQL:', error.message);
            return new Map();
        }
    }

    /**
     * ✅ FECHAS desde PostgreSQL PedCompra_Linea (MAX(FecEntre) por producto)
     * - Match por código canónico (ej: ARE000123 == ARE123)
     * - Devuelve un Map con claves = códigos solicitados (tal cual entraron) y valores fecha/null
     */
    static async getFechaEstimadaMapByCodesFast(codes = []) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const movTable = sanitizeTableName(process.env.MOV_STOCK_PREVISTOS_TABLE, 'pedcompra_linea');
        const almacValue = process.env.MOV_STOCK_PREVISTOS_ALMAC_VALUE ?? null;

        try {
            const cols = await StockModel.getTableColumns(movTable);
            const productCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_PRODUCT_COLUMN, [
                'codprodu',
                'cod_produ',
            ]);
            const fechaCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_DATE_COLUMN, [
                'fecentre',
                'fecha_entrega',
                'fecha',
            ]);
            const almacCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_ALMAC_COLUMN, [
                'codalmac',
                'almacen',
                'cod_almac',
            ]);

            if (!productCol || !fechaCol) return new Map();

            // requested -> canonical mapping (para devolver valores por el código original solicitado)
            const canonicalToRequested = new Map(); // canonical -> Set(requestedCodes)
            for (const requestedCode of normalizedCodes) {
                const canonical = StockModel.normalizeCodeCanonical(requestedCode);
                if (!canonicalToRequested.has(canonical)) canonicalToRequested.set(canonical, new Set());
                canonicalToRequested.get(canonical).add(requestedCode);
            }

            const map = new Map();
            const canonicalCodes = [...canonicalToRequested.keys()];
            const limited = canonicalCodes.slice(0, StockModel.FECHA_FALLBACK_MAX_CODES);
            const chunks = StockModel.chunkArray(limited, 1000);

            for (const chunk of chunks) {
                const params = [chunk];
                let whereAlm = '';

                // ✅ FIX: si el almacValue es 0/00/000... filtramos con regex '^0+$' (porque en BD suele venir "00")
                if (almacCol && almacValue !== null && almacValue !== undefined && String(almacValue).trim() !== '') {
                    const av = String(almacValue).trim();

                    if (/^0+$/.test(av)) {
                        // NO añadimos parámetro extra
                        whereAlm = ` AND TRIM(COALESCE(m.${quoteIdent(almacCol)}::text, '')) ~ '^0+$'`;
                    } else {
                        params.push(av);
                        whereAlm = ` AND TRIM(COALESCE(m.${quoteIdent(almacCol)}::text, '')) = $2`;
                    }
                }

                // Canonicalización SQL: UPPER + quita ceros a la izquierda del tramo numérico: ABC00012 -> ABC12
                const canonicalSql = `UPPER(REGEXP_REPLACE(TRIM(COALESCE(m.${quoteIdent(
                    productCol
                )}::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2'))`;

                const { rows } = await pool.query(
                    `
          SELECT
            ${canonicalSql} AS canonical_code,
            TO_CHAR(MAX(m.${quoteIdent(fechaCol)}), 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_estimada
          FROM ${quoteIdent(movTable)} m
          WHERE ${canonicalSql} = ANY($1)
          ${whereAlm}
          GROUP BY ${canonicalSql}
        `,
                    params
                );

                for (const row of rows) {
                    const canonical = StockModel.normalizeCode(row.canonical_code);
                    if (!canonical) continue;
                    const requestedSet = canonicalToRequested.get(canonical);
                    if (!requestedSet) continue;

                    for (const requestedCode of requestedSet) {
                        map.set(requestedCode, row.fecha_estimada || null);
                    }
                }
            }

            // Asegurar null para todo lo solicitado que no haya venido
            for (const requestedCode of normalizedCodes) {
                if (!map.has(requestedCode)) map.set(requestedCode, null);
            }

            return map;
        } catch (error) {
            console.error('Error fetching Fecha Estimada from PostgreSQL pedcompra_linea:', error.message);
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
            empresa,
            ejercicio,
            codprodu,
            stockinicial,
            cancompra,
            canvendi,
            canentra,
            cansalida,
            canfabri,
            canconsum,
            stockactual,
            canpenrecib,
            canpenservir,
            canpenentra,
            canpensalida,
            canpenfabri,
            canpenconsum,
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
                empresa,
                ejercicio,
                codprodu,
                stockinicial,
                cancompra,
                canvendi,
                canentra,
                cansalida,
                canfabri,
                canconsum,
                stockactual,
                canpenrecib,
                canpenservir,
                canpenentra,
                canpensalida,
                canpenfabri,
                canpenconsum,
                stockprevisto,
            ]
        );

        return rows[0];
    }

    static async update({ codprodu, input }) {
        const fields = Object.keys(input)
            .map((key, index) => `"${key}" = $${index + 2}`)
            .join(', ');
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
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    static EXCLUDE_TERMS = [
        'QUALITY',
        'TAPILLA',
        'CUTTING',
        'CUTTINGS',
        'RIEL',
        'RIELES',
        'HERRAJES',
        'SOBRES',
        'CARGO',
        'RELLENO',
        'CERTIFICADO',
        'TRABAJOS',
        'COJIN',
        'CUBRE',
        'ESTOR',
        'CAIDA',
        'PLAID',
        'CABECERO',
        'ETAMIN',
        'CARTULINA',
        'PORTES',
        'COSTE DEL TRANSPORTE',
        'MECANISMOS',
        'BOLSAS',
        'TUBOS',
        'SERVILLETAS',
        'CONTRACT',
        'COMISION',
        'COLCHA',
        'PERCHA',
        'LIBRO',
        'VARIOS',
        'CARRE GAME',
        'LIENZO',
        'BOLONIA',
        'VARADERO',
        'TAIGA',
        'DUNE',
        'ZAMFARA',
        'SHIRA',
        'CALCUTA',
        'POISON',
        'TUNDRA',
        'AGATA',
        'CUARZO',
        'DIAMANTE',
        'SUEDER',
        'SIDDHARTA',
        'NOMAD',
        'HABITAT',
        'GRAVITY',
        'LUNAR',
        'CANDIDA',
        'BAMBU',
        'PARLOUR',
        'BENNELONG',
        'MACARENA',
        'NIJAR',
        'MOJACAR',
        'LOSENGO',
        'VELVETY',
        'MENORCA',
        'BAUPRES',
        'LOST ODISSEY',
        'MEROPS',
        'MARTINA',
        'ORQUIDEA',
        'GASHGAI',
        'DAMASCO',
        'DOVES',
        'SENES',
        'ESPERANZA',
        'INMACULADA',
        'ATLAS',
        'MIRROR',
        'ANTILLA',
        'ANTILLA VELVET',
        'LUMIERE',
        'MIGRATION',
        'NIMBOSILVA',
        'PERSIAN MOOD',
        'RINPA',
        'SURIRI',
        'XUBEC',
        'AHURA',
        'IMPERIAL',
        'KUKULCAN',
        'MOIRE',
        'MOREAU',
        'PERRAULT',
        'PUMMERIN',
        'TOPKAPI',
        'TULUM',
        'ZAHARA',
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