import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});

export class IntrastatModel {

    static normalize(value) {
        if (!value) return '';
        return String(value).trim().toUpperCase();
    }

    // 🔹 1. CLIENTE POR NIF
    static async getClienteByNif({ nif }) {
        const normalized = this.normalize(nif);

        const query = `
            SELECT codclien, nif, razclien, ejercicio
            FROM clientes
            WHERE UPPER(TRIM(COALESCE(nif, ''))) = $1
            ORDER BY ejercicio DESC NULLS LAST
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [normalized]);
        return rows[0] || null;
    }

    // 🔹 2. KM POR CLIENTE
    static async getKmByCodclien({ codclien }) {
        const normalized = this.normalize(codclien);

        const query = `
            SELECT kmsedehastacliente, kmfronteraalcliente
            FROM clientescmpadi
            WHERE UPPER(TRIM(codclien)) = $1
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [normalized]);
        return rows[0] || null;
    }

    // 🔹 3. PORTES
    static async getPortesByFactura({ codserfacventa, nfacventa }) {
        const query = `
            SELECT impportes
            FROM facventa
            WHERE codserfacventa = $1
            AND nfacventa = $2
            ORDER BY ejercicio DESC NULLS LAST
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [
            codserfacventa,
            String(nfacventa),
        ]);

        return rows[0]?.impportes || 0;
    }

    // 🔹 4. TOTAL FACTURA
    static async getTotalFactura({ codserfacventa, nfacventa }) {
        const query = `
            SELECT impbase
            FROM facventa
            WHERE codserfacventa = $1
            AND nfacventa = $2
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [
            codserfacventa,
            nfacventa
        ]);

        return Number(rows[0]?.impbase || 0);
    }

    static async getDescripcionByCodproduList(codproduList) {
        if (!codproduList.length) return {};

        const unique = [...new Set(
            codproduList
                .filter(Boolean)
                .map(c => String(c).trim().toUpperCase())
        )];

        if (!unique.length) return {};

        const placeholders = unique.map((_, i) => `$${i + 1}`).join(',');

        const query = `
        SELECT codprodu, codtipo
        FROM productos
        WHERE UPPER(TRIM(codprodu)) IN (${placeholders})
    `;

        const { rows } = await pool.query(query, unique);

        const mapCodtipoToDescripcion = {
            '101': 'TEJIDOS PARA DECORACION',
            '106': 'LIBRO MUESTRARIO',
            '105': 'PERCHA MUESTRARIO',
            '103': 'PAPEL PARED',
            '109': 'CARRE GAME',
        };

        const result = {};

        for (const row of rows) {
            const cod = String(row.codprodu).trim().toUpperCase();
            const tipo = String(row.codtipo || '').trim();

            result[cod] = mapCodtipoToDescripcion[tipo] || '';
        }

        return result;
    }

    // 🔹 6. IVA INCORRECTO (CORREGIDO Y FILTRADO POR FACTURA)
    static async getFacturasConIvaIncorrectoByList(facturas) {
        if (!facturas.length) return [];

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(codserfacventa)) = $${i * 2 + 1} AND TRIM(nfacventa) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfacventa).trim().toUpperCase(),
            String(f.nfacventa).trim()
        ]);

        const query = `
        SELECT 
            sub.codserfacventa,
            sub.nfacventa,
            STRING_AGG(DISTINCT TRIM(l.codiva), ',') AS codigos_iva
        FROM (
            SELECT codserfacventa, nfacventa, nalbventa
            FROM albventa
            WHERE ${condiciones}
        ) sub
        JOIN albventa_linea l
            ON l.nalbventa = sub.nalbventa
        WHERE
            TRIM(COALESCE(l.codserfacventa, '')) = TRIM(sub.codserfacventa)
            AND TRIM(COALESCE(l.nfacventa, '')) = TRIM(sub.nfacventa)
            AND l.codiva IS NOT NULL
            AND TRIM(l.codiva) <> ''
            AND TRIM(l.codiva) <> '04'
        GROUP BY sub.codserfacventa, sub.nfacventa
        ORDER BY sub.codserfacventa, sub.nfacventa
    `;

        const { rows } = await pool.query(query, valores);
        return rows;
    }

    // 🔹 7. INCOTERMS POR FACTURA
    static async getIncotermsByFacturaList(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(codserfacventa)) = $${i * 2 + 1} 
      AND TRIM(nfacventa) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfacventa).trim().toUpperCase(),
            String(f.nfacventa).trim()
        ]);

        const query = `
        SELECT 
            codserfacventa,
            nfacventa,
            COALESCE(MAX(TRIM(codincoterms)), '') AS codincoterms
        FROM albventa
        WHERE ${condiciones}
        GROUP BY codserfacventa, nfacventa
    `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfacventa}-${row.nfacventa}`
                .replace(/\s+/g, '')
                .toUpperCase();

            result[key] = row.codincoterms || '';
        }

        return result;
    }

    // 🔹 5. IVA INCORRECTO (CORRECTO Y FILTRADO)
    static async getCodigosProductoPorFactura(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(l.codserfacventa)) = $${i * 2 + 1} 
        AND TRIM(l.nfacventa) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfacventa).trim().toUpperCase(),
            String(f.nfacventa).trim()
        ]);

        const query = `
            SELECT 
                l.codserfacventa,
                l.nfacventa,
                l.nalbventa,
                l.linea,
                l.codprodu
            FROM albventa_linea l
            WHERE (${condiciones})

            AND TRIM(COALESCE(l.codprodu, '')) <> ''
            AND COALESCE(l.impbruto, 0) > 0

            ORDER BY l.nalbventa, l.linea
        `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfacventa}-${row.nfacventa}`
                .replace(/\s+/g, '')
                .toUpperCase();

            if (!result[key]) result[key] = [];

            result[key].push(row.codprodu);
        }

        return result;
    }
}