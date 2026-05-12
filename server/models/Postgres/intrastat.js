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

        return Number(rows[0]?.impportes || 0);
    }

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

    static async getFacturasVentaConIvaNoPermitidoByList({ facturasList, codigosPermitidos }) {
        if (!Array.isArray(facturasList) || facturasList.length === 0) {
            return [];
        }

        const condiciones = facturasList.map((_, index) =>
            `(UPPER(TRIM(a.codserfacventa)) = $${index * 2 + 1}
          AND TRIM(a.nfacventa) = $${index * 2 + 2})`
        ).join(' OR ');

        const valores = facturasList.flatMap(factura => [
            String(factura.codserfacventa).trim().toUpperCase(),
            String(factura.nfacventa).trim()
        ]);

        const codigosPermitidosNormalizados = codigosPermitidos.map(codigo =>
            String(codigo).trim().padStart(2, '0')
        );

        valores.push(codigosPermitidosNormalizados);
        const codigosPermitidosIndex = valores.length;

        const query = `
        SELECT DISTINCT
            a.codserfacventa,
            a.nfacventa
        FROM albventa a
        JOIN albventa_linea l
            ON l.nalbventa = a.nalbventa
        WHERE (${condiciones})
          AND TRIM(COALESCE(l.codserfacventa, '')) = TRIM(a.codserfacventa)
          AND TRIM(COALESCE(l.nfacventa, '')) = TRIM(a.nfacventa)
          AND (
                l.codiva IS NULL
                OR TRIM(CAST(l.codiva AS text)) = ''
                OR LPAD(TRIM(CAST(l.codiva AS text)), 2, '0') <> ALL($${codigosPermitidosIndex}::text[])
          )
        ORDER BY
            a.codserfacventa,
            a.nfacventa
    `;

        const { rows } = await pool.query(query, valores);

        return rows;
    }

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

    static async getIncotermsByFacturaList(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(a.codserfacventa)) = $${i * 2 + 1}
        AND TRIM(a.nfacventa) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfacventa).trim().toUpperCase(),
            String(f.nfacventa).trim()
        ]);

        const query = `
        SELECT 
            a.codserfacventa,
            a.nfacventa,
            COALESCE(MAX(TRIM(a.codincoterms)), '') AS codincoterms,
            COALESCE(MAX(TRIM(i.codintrastat)), '') AS codintrastat,
            MAX(i.codmodotransporte) AS codmodotransporte
        FROM albventa a
        LEFT JOIN incoterms i
            ON UPPER(TRIM(i.codincoterms)) = UPPER(TRIM(a.codincoterms))
        WHERE ${condiciones}
        GROUP BY a.codserfacventa, a.nfacventa
    `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfacventa}-${row.nfacventa}`
                .replace(/\s+/g, '')
                .toUpperCase();

            result[key] = {
                codincoterms: row.codincoterms || '',
                codintrastat: row.codintrastat || '',
                codmodotransporte: row.codmodotransporte || '',
                modoTransporte: this.getModoTransporte(row.codmodotransporte),
            };
        }

        return result;
    }

    static getModoTransporte(codmodotransporte) {
        const value = Number(codmodotransporte);

        const map = {
            1: 'MARITIMO',
            3: 'TERRESTRE',
            4: 'AEREO',
        };

        return map[value] || '';
    }

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

    static async getFacturasCompraByList(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(codserfaccompra)) = $${i * 2 + 1}
            AND TRIM(nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
            SELECT *
            FROM faccompra
            WHERE ${condiciones}
        `;

        const { rows } = await pool.query(query, valores);

        const map = {};

        for (const row of rows) {
            const key = `${row.codserfaccompra}-${row.nfaccompra}`
                .replace(/\s+/g, '')
                .toUpperCase();

            map[key] = row;
        }

        return map;
    }


    static async getIncotermsCompraByFacturaList(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(a.codserfaccompra)) = $${i * 2 + 1}
        AND TRIM(a.nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
        SELECT 
            a.codserfaccompra,
            a.nfaccompra,
            COALESCE(MAX(TRIM(a.codincoterms)), '') AS codincoterms,
            COALESCE(MAX(TRIM(i.codintrastat)), '') AS codintrastat,
            MAX(i.codmodotransporte) AS codmodotransporte
        FROM albcompra a
        LEFT JOIN incoterms i
            ON UPPER(TRIM(i.codincoterms)) = UPPER(TRIM(a.codincoterms))
        WHERE ${condiciones}
        GROUP BY a.codserfaccompra, a.nfaccompra
    `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfaccompra}-${row.nfaccompra}`
                .replace(/\s+/g, '')
                .toUpperCase();

            result[key] = {
                codincoterms: row.codincoterms || '',
                codintrastat: row.codintrastat || '',
                codmodotransporte: row.codmodotransporte || '',
                modoTransporte: this.getModoTransporte(row.codmodotransporte),
            };
        }

        return result;
    }

    static async getPortesByFacturaCompra({ codserfaccompra, nfaccompra }) {
        const query = `
            SELECT impportes
            FROM faccompra
            WHERE codserfaccompra = $1
            AND nfaccompra = $2
            ORDER BY ejercicio DESC NULLS LAST
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [
            codserfaccompra,
            String(nfaccompra),
        ]);

        return Number(rows[0]?.impportes || 0);
    }

    static async getTotalFacturaCompra({ codserfaccompra, nfaccompra }) {
        const query = `
        SELECT impbruto
        FROM faccompra
        WHERE 
            UPPER(TRIM(codserfaccompra)) = $1
        AND TRIM(nfaccompra) = $2
        LIMIT 1
    `;

        const params = [
            this.normalize(codserfaccompra),
            String(nfaccompra).trim()
        ];

        console.log('=== DEBUG getTotalFacturaCompra ===');
        console.log('params RAW:', params);
        console.log('serie length:', params[0].length);
        console.log('numero length:', params[1].length);
        console.log('serie chars:', [...params[0]].map(c => c.charCodeAt(0)));
        console.log('numero chars:', [...params[1]].map(c => c.charCodeAt(0)));

        const { rows } = await pool.query(query, params);

        console.log('rows faccompra:', rows);

        return Number(rows[0]?.impbruto || 0);
    }

    static async getLineasAlbaranCompraPorFactura(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(l.codserfaccompra)) = $${i * 2 + 1}
            AND TRIM(l.nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
            SELECT 
                l.codserfaccompra,
                l.nfaccompra,
                l.codseralbcompra,
                l.nalbcompra,
                l.linea,
                l.codprodu
            FROM albcompra_linea l
            WHERE (${condiciones})
            AND TRIM(COALESCE(l.codprodu, '')) <> ''
            AND UPPER(TRIM(l.codprodu)) <> 'PORTES75'
            AND COALESCE(l.impbruto, 0) > 0
            ORDER BY l.nalbcompra, l.linea
        `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfaccompra}-${row.nfaccompra}`
                .replace(/\s+/g, '')
                .toUpperCase();

            if (!result[key]) result[key] = [];
            result[key].push(row.codprodu);
        }

        return result;
    }

    static async getPortes75ByFacturaCompra({ codserfaccompra, nfaccompra }) {
        const query = `
        SELECT COALESCE(SUM(COALESCE(impbruto, 0)), 0) AS total_portes75
        FROM albcompra_linea
        WHERE 
            UPPER(TRIM(codserfaccompra)) = $1
        AND TRIM(nfaccompra) = $2
        AND UPPER(TRIM(codprodu)) = 'PORTES75'
    `;

        const params = [
            this.normalize(codserfaccompra),
            String(nfaccompra).trim()
        ];

        const { rows } = await pool.query(query, params);

        return Number(rows[0]?.total_portes75 || 0);
    }

    static async getProveedoresByFacturas(facturas) {
        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(f.codserfaccompra)) = $${i * 2 + 1}
            AND TRIM(f.nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
            SELECT DISTINCT p.*
            FROM proveedores p
            JOIN faccompra f ON f.codprove = p.codprove
            WHERE ${condiciones}
        `;

        const { rows } = await pool.query(query, valores);

        const map = {};

        for (const row of rows) {
            map[row.codprove] = row;
        }

        return map;
    }

    static async getFacturasCompraConIvaIncorrectoByList(facturas) {
        if (!facturas.length) return [];

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(codserfaccompra)) = $${i * 2 + 1}
        AND TRIM(nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
        SELECT 
            sub.codserfaccompra,
            sub.nfaccompra,
            STRING_AGG(DISTINCT TRIM(l.codiva), ',') AS codigos_iva
        FROM (
            SELECT codserfaccompra, nfaccompra, nalbcompra
            FROM albcompra
            WHERE ${condiciones}
        ) sub
        JOIN albcompra_linea l
            ON l.nalbcompra = sub.nalbcompra
        WHERE
            TRIM(COALESCE(l.codserfaccompra, '')) = TRIM(sub.codserfaccompra)
            AND TRIM(COALESCE(l.nfaccompra, '')) = TRIM(sub.nfaccompra)
            AND l.codiva IS NOT NULL
            AND TRIM(l.codiva) <> ''
            AND TRIM(l.codiva) <> '04'
        GROUP BY sub.codserfaccompra, sub.nfaccompra
        ORDER BY sub.codserfaccompra, sub.nfaccompra
    `;

        const { rows } = await pool.query(query, valores);
        return rows;
    }

    static async getImportesExtraByFacturaCompra(facturas) {

        if (!facturas.length) return {};

        const condiciones = facturas.map((_, i) =>
            `(UPPER(TRIM(codserfaccompra)) = $${i * 2 + 1}
        AND TRIM(nfaccompra) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturas.flatMap(f => [
            String(f.codserfaccompra).trim().toUpperCase(),
            String(f.nfaccompra).trim()
        ]);

        const query = `
        SELECT
            codserfaccompra,
            nfaccompra,
            COALESCE(SUM(COALESCE(impbruto, 0)), 0) AS total
        FROM albcompra_linea
        WHERE
            (${condiciones})

            -- SIN PRODUCTO REAL
            AND REPLACE(COALESCE(codprodu, ''), CHR(160), '') ~ '^\\s*$'

            -- CON DESCRIPCION
            AND TRIM(COALESCE(desprodu, '')) <> ''

            -- IGNORAR CUADRES
            AND UPPER(TRIM(desprodu)) NOT LIKE '%CUADRE%'

            -- SOLO LINEAS CON IMPORTE
            AND COALESCE(impbruto, 0) <> 0

        GROUP BY
            codserfaccompra,
            nfaccompra
    `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {

            const key =
                `${row.codserfaccompra}-${row.nfaccompra}`
                    .replace(/\s+/g, '')
                    .toUpperCase();

            result[key] = Number(row.total || 0);
        }

        return result;
    }

    static async getKmByProveedores(codproves) {
        if (!codproves.length) return {};

        const { rows } = await pool.query(
            `SELECT * FROM proveedores_cmpadi WHERE codprove = ANY($1)`,
            [codproves]
        );

        const map = {};

        for (const row of rows) {
            map[row.codprove] = row;
        }

        return map;
    }
}