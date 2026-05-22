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

    static async getKilometrosVentaByFacturaList(facturasList) {
        if (!Array.isArray(facturasList) || !facturasList.length) return {};

        const condiciones = facturasList.map((_, i) =>
            `(UPPER(TRIM(CAST(a.codserfacventa AS text))) = $${i * 2 + 1}
        AND TRIM(CAST(a.nfacventa AS text)) = $${i * 2 + 2})`
        ).join(' OR ');

        const valores = facturasList.flatMap(factura => [
            String(factura.codserfacventa).trim().toUpperCase(),
            String(factura.nfacventa).trim()
        ]);

        const query = `
        SELECT
            a.codserfacventa,
            a.nfacventa,
            COALESCE(MAX(NULLIF(TRIM(CAST(a.razentre AS text)), '')), '') AS razentre,
            COALESCE(MAX(NULLIF(TRIM(CAST(cli.codclien AS text)), '')), '') AS codclien,
            COALESCE(MAX(NULLIF(TRIM(CAST(cli.razclien AS text)), '')), '') AS razclien,
            COALESCE(MAX(NULLIF(TRIM(CAST(cmp.kmsedehastacliente AS text)), '')), '') AS kmsedehastacliente,
            COALESCE(MAX(NULLIF(TRIM(CAST(cmp.kmfronteraalcliente AS text)), '')), '') AS kmfronteraalcliente
        FROM albventa a
        LEFT JOIN clientes cli
            ON UPPER(TRIM(CAST(cli.razclien AS text))) = UPPER(TRIM(CAST(a.razentre AS text)))
        LEFT JOIN clientescmpadi cmp
            ON UPPER(TRIM(CAST(cmp.codclien AS text))) = UPPER(TRIM(CAST(cli.codclien AS text)))
        WHERE ${condiciones}
        GROUP BY
            a.codserfacventa,
            a.nfacventa
    `;

        const { rows } = await pool.query(query, valores);

        const result = {};

        for (const row of rows) {
            const key = `${row.codserfacventa}-${row.nfacventa}`
                .replace(/\s+/g, '')
                .toUpperCase();

            result[key] = {
                razentre: row.razentre || '',
                codclien: row.codclien || '',
                razclien: row.razclien || '',
                kmsedehastacliente: row.kmsedehastacliente || '',
                kmfronteraalcliente: row.kmfronteraalcliente || '',
            };
        }

        return result;
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

    static async getLineasVentasIntrastatFaltantesPorMes({
        mesIntrastat,
        facturasExistentes = [],
    }) {
        if (!mesIntrastat) return [];

        const [year, month] = String(mesIntrastat).split('-').map(Number);

        if (!year || !month) return [];

        const fechaInicioSql = `${year}-${String(month).padStart(2, '0')}-01`;
        const fechaFinDate = new Date(year, month, 1);
        const fechaFinSql = fechaFinDate.toISOString().slice(0, 10);

        const valores = [fechaInicioSql, fechaFinSql];

        const facturasExistentesNormalizadas = facturasExistentes
            .filter(Boolean)
            .map(factura =>
                String(factura)
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '')
            );

        let filtroFacturasExistentes = '';

        if (facturasExistentesNormalizadas.length > 0) {
            valores.push(facturasExistentesNormalizadas);

            filtroFacturasExistentes = `
            AND (
                UPPER(
                    REPLACE(
                        TRIM(CAST(a.codserfacventa AS text)) || '-' || TRIM(CAST(a.nfacventa AS text)),
                        ' ',
                        ''
                    )
                ) <> ALL($${valores.length}::text[])
            )
        `;
        }

        const query = `
        WITH lineas AS (
            SELECT
                a.codserfacventa,
                a.nfacventa,
                a.nalbventa,
                a.fecha AS fecha_albaran,

                f.fecconta AS fecha_factura,
                f.codclien,

                a.razentre,

                l.linea,
                l.codprodu,
                l.codiva,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.impbruto AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS importe_facturado,

                COALESCE(CAST(c.nif AS text), '') AS nif_vies,
                COALESCE(CAST(c.codpais AS text), '') AS codpais_cliente,

                COALESCE(CAST(p.codintrastat AS text), '') AS codintrastat,
                COALESCE(CAST(p.codpaisorigen AS text), '') AS codpaisorigen,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.cantidad AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS unidades_suplementarias,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(p.kilos AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS kilos_producto
            FROM facventa f
            JOIN albventa a
                ON UPPER(TRIM(CAST(a.codserfacventa AS text))) = UPPER(TRIM(CAST(f.codserfacventa AS text)))
               AND TRIM(CAST(a.nfacventa AS text)) = TRIM(CAST(f.nfacventa AS text))

            JOIN albventa_linea l
                ON l.nalbventa = a.nalbventa
               AND UPPER(TRIM(CAST(l.codserfacventa AS text))) = UPPER(TRIM(CAST(a.codserfacventa AS text)))
               AND TRIM(CAST(l.nfacventa AS text)) = TRIM(CAST(a.nfacventa AS text))

            LEFT JOIN clientes c
                ON UPPER(TRIM(CAST(c.codclien AS text))) = UPPER(TRIM(CAST(f.codclien AS text)))

            LEFT JOIN productos p
                ON UPPER(TRIM(CAST(p.codprodu AS text))) = UPPER(TRIM(CAST(l.codprodu AS text)))

            WHERE f.fecconta >= $1
              AND f.fecconta < $2

              AND LPAD(TRIM(CAST(l.codiva AS text)), 2, '0') = '04'

              AND COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.impbruto AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
              ) <> 0

              ${filtroFacturasExistentes}
        )
        SELECT
            *,
            ROUND(
                kilos_producto * unidades_suplementarias,
                3
            ) AS masa_neta
        FROM lineas
        ORDER BY
            codserfacventa,
            nfacventa,
            nalbventa,
            linea
    `;

        const { rows } = await pool.query(query, valores);

        return rows;
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
        SELECT codprodu, codtipo, codmarca
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
            const marca = String(row.codmarca || '').trim().toUpperCase();

            if (marca === 'CON') {
                result[cod] = 'ARTICULO PARA DECORACION';
                continue;
            }

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

          -- Solo comprobar IVA en líneas con importe real
          AND COALESCE(l.impbruto, 0) <> 0

          -- Si una línea con importe real tiene IVA distinto de 04 o 16, se elimina la factura
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

    static async getFacturasCompraConIvaNoPermitidoByList({
        facturasList,
        codigosPermitidos,
    }) {
        if (!Array.isArray(facturasList) || facturasList.length === 0) {
            return [];
        }

        const condiciones = facturasList.map((_, index) =>
            `(UPPER(TRIM(CAST(a.codserfaccompra AS text))) = $${index * 2 + 1}
          AND TRIM(CAST(a.nfaccompra AS text)) = $${index * 2 + 2})`
        ).join(' OR ');

        const valores = facturasList.flatMap(factura => [
            String(factura.codserfaccompra).trim().toUpperCase(),
            String(factura.nfaccompra).trim()
        ]);

        const codigosPermitidosNormalizados = codigosPermitidos.map(codigo =>
            String(codigo).trim().padStart(2, '0')
        );

        valores.push(codigosPermitidosNormalizados);
        const codigosPermitidosIndex = valores.length;

        const query = `
        SELECT DISTINCT
            a.codserfaccompra,
            a.nfaccompra
        FROM albcompra a
        JOIN albcompra_linea l
            ON l.nalbcompra = a.nalbcompra
        WHERE (${condiciones})
          AND TRIM(COALESCE(CAST(l.codserfaccompra AS text), '')) = TRIM(CAST(a.codserfaccompra AS text))
          AND TRIM(COALESCE(CAST(l.nfaccompra AS text), '')) = TRIM(CAST(a.nfaccompra AS text))
          AND COALESCE(l.impbruto, 0) <> 0
          AND (
                l.codiva IS NULL
                OR TRIM(CAST(l.codiva AS text)) = ''
                OR LPAD(TRIM(CAST(l.codiva AS text)), 2, '0') <> ALL($${codigosPermitidosIndex}::text[])
          )
        ORDER BY
            a.codserfaccompra,
            a.nfaccompra
    `;

        const { rows } = await pool.query(query, valores);

        return rows;
    }

    static async getLineasComprasIntrastatFaltantesPorMes({
        mesIntrastat,
        facturasExistentes = [],
    }) {
        if (!mesIntrastat) return [];

        const [year, month] = String(mesIntrastat).split('-').map(Number);

        if (!year || !month) return [];

        const fechaInicioSql = `${year}-${String(month).padStart(2, '0')}-01`;
        const fechaFinDate = new Date(year, month, 1);
        const fechaFinSql = fechaFinDate.toISOString().slice(0, 10);

        const valores = [fechaInicioSql, fechaFinSql];

        const facturasExistentesNormalizadas = facturasExistentes
            .filter(Boolean)
            .map(factura =>
                String(factura)
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '')
            );

        let filtroFacturasExistentes = '';

        if (facturasExistentesNormalizadas.length > 0) {
            valores.push(facturasExistentesNormalizadas);

            filtroFacturasExistentes = `
            AND (
                UPPER(
                    REPLACE(
                        TRIM(CAST(a.codserfaccompra AS text)) || '-' || TRIM(CAST(a.nfaccompra AS text)),
                        ' ',
                        ''
                    )
                ) <> ALL($${valores.length}::text[])
            )
        `;
        }

        const query = `
        WITH lineas AS (
            SELECT
                a.codserfaccompra,
                a.nfaccompra,
                a.nalbcompra,

                f.fecconta AS fecha_factura,
                f.codprove,

                l.linea,
                l.codprodu,
                l.codiva,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.impbruto AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS importe_facturado,

                COALESCE(CAST(pv.nif AS text), '') AS nif_vies,
                COALESCE(CAST(pv.codpais AS text), '') AS codpais_proveedor,

                COALESCE(CAST(pr.codintrastat AS text), '') AS codintrastat,
                COALESCE(CAST(pr.codpaisorigen AS text), '') AS codpaisorigen,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.cantidad AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS unidades_suplementarias,

                COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(pr.kilos AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
                ) AS kilos_producto
            FROM faccompra f
            JOIN albcompra a
                ON UPPER(TRIM(CAST(a.codserfaccompra AS text))) = UPPER(TRIM(CAST(f.codserfaccompra AS text)))
               AND TRIM(CAST(a.nfaccompra AS text)) = TRIM(CAST(f.nfaccompra AS text))

            JOIN albcompra_linea l
                ON l.nalbcompra = a.nalbcompra
               AND UPPER(TRIM(CAST(l.codserfaccompra AS text))) = UPPER(TRIM(CAST(a.codserfaccompra AS text)))
               AND TRIM(CAST(l.nfaccompra AS text)) = TRIM(CAST(a.nfaccompra AS text))

            LEFT JOIN proveedores pv
                ON UPPER(TRIM(CAST(pv.codprove AS text))) = UPPER(TRIM(CAST(f.codprove AS text)))

            LEFT JOIN productos pr
                ON UPPER(TRIM(CAST(pr.codprodu AS text))) = UPPER(TRIM(CAST(l.codprodu AS text)))

            WHERE f.fecconta >= $1
              AND f.fecconta < $2

              AND LPAD(TRIM(CAST(l.codiva AS text)), 2, '0') = '04'

              AND COALESCE(
                    NULLIF(
                        regexp_replace(
                            REPLACE(CAST(l.impbruto AS text), ',', '.'),
                            '[^0-9.-]',
                            '',
                            'g'
                        ),
                        ''
                    )::numeric,
                    0
              ) <> 0

              AND UPPER(TRIM(CAST(COALESCE(l.codprodu, '') AS text))) <> 'PORTES75'

              ${filtroFacturasExistentes}
        )
        SELECT
            *,
            ROUND(
                kilos_producto * unidades_suplementarias,
                3
            ) AS masa_neta
        FROM lineas
        ORDER BY
            codserfaccompra,
            nfaccompra,
            nalbcompra,
            linea
    `;

        const { rows } = await pool.query(query, valores);

        return rows;
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