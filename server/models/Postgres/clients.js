import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 10000,
});

const buildNormalizedClientSearch = (fieldName) => `
  regexp_replace(
    translate(
      lower(${fieldName}),
      'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc'
    ),
    '[^a-z0-9]',
    '',
    'g'
  )
`;


const normalizeClientSearchTerm = (value = '') =>
    value
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const normalizeCodrepres = (codrepres) => {
    if (codrepres === undefined) return undefined;

    if (Array.isArray(codrepres)) {
        return [...new Set(
            codrepres.map((codrepre) => String(codrepre).trim()).filter(Boolean)
        )];
    }

    if (typeof codrepres === 'string') {
        return [...new Set(
            codrepres
                .replace(/[{}"]/g, '')
                .split(',')
                .map((codrepre) => codrepre.trim())
                .filter(Boolean)
        )];
    }

    return [];
};

const normalizeCodclienList = (codclien) => {
    if (codclien === undefined) return undefined;

    if (Array.isArray(codclien)) {
        return [...new Set(
            codclien.map((value) => String(value).trim()).filter(Boolean)
        )];
    }

    return [...new Set(
        String(codclien)
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
    )];
};

const hasEmptyCodrepresFilter = (codrepres) => {
    const normalizedCodrepres = normalizeCodrepres(codrepres);
    return Array.isArray(normalizedCodrepres) && normalizedCodrepres.length === 0;
};

const hasEmptyCodclienFilter = (codclien) => {
    const normalizedCodclien = normalizeCodclienList(codclien);
    return Array.isArray(normalizedCodclien) && normalizedCodclien.length === 0;
};

const addCodrepresFilter = ({ queryText, params, codrepres, tableAlias = '' }) => {
    const normalizedCodrepres = normalizeCodrepres(codrepres);

    if (normalizedCodrepres === undefined) {
        return queryText;
    }

    const fieldPrefix = tableAlias ? `${tableAlias}.` : '';

    queryText += ` AND ${fieldPrefix}codrepre = ANY($${params.length + 1})`;
    params.push(normalizedCodrepres);

    return queryText;
};

const addCodclienFilter = ({ queryText, params, codclien, tableAlias = '' }) => {
    const normalizedCodclien = normalizeCodclienList(codclien);

    if (normalizedCodclien === undefined) {
        return queryText;
    }

    const fieldPrefix = tableAlias ? `${tableAlias}.` : '';

    queryText += ` AND ${fieldPrefix}codclien = ANY($${params.length + 1})`;
    params.push(normalizedCodclien);

    return queryText;
};

export class ClienteModel {
    static async getAll({ offset, limit, codpais, codprovi, query, status, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return [];
        }

        let queryText = `
            SELECT * 
            FROM clientes 
            WHERE COALESCE(UPPER(dadobaja), '') <> 'S'
        `;

        const params = [];

        queryText = addCodclienFilter({ queryText, params, codclien });
        queryText = addCodrepresFilter({ queryText, params, codrepres });

        if (codpais) {
            queryText += ` AND codpais = $${params.length + 1}`;
            params.push(codpais);
        }

        if (codprovi) {
            queryText += ` AND codprovi = $${params.length + 1}`;
            params.push(codprovi);
        }

        if (query) {
            const normalizedQuery = normalizeClientSearchTerm(query);

            queryText += `
                AND ${buildNormalizedClientSearch('razclien')} LIKE $${params.length + 1}
            `;

            params.push(`%${normalizedQuery}%`);
        }

        if (status) {
            queryText += ` AND estado = $${params.length + 1}`;
            params.push(status);
        }

        queryText += `
            ORDER BY localidad
            LIMIT $${params.length + 1}
            OFFSET $${params.length + 2}
        `;

        params.push(Number(limit), Number(offset));

        try {
            const { rows } = await pool.query(queryText, params);
            return rows;
        } catch (error) {
            console.error('Error fetching clients:', error);
            throw new Error('Error fetching clients');
        }
    }

    static async getCount({ codpais, codprovi, query, status, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return 0;
        }

        let queryText = `
            SELECT COUNT(*) 
            FROM clientes 
            WHERE COALESCE(UPPER(dadobaja), '') <> 'S'
        `;

        const params = [];

        queryText = addCodclienFilter({ queryText, params, codclien });
        queryText = addCodrepresFilter({ queryText, params, codrepres });

        if (codpais) {
            queryText += ` AND codpais = $${params.length + 1}`;
            params.push(codpais);
        }

        if (codprovi) {
            queryText += ` AND codprovi = $${params.length + 1}`;
            params.push(codprovi);
        }

        if (query) {
            const normalizedQuery = normalizeClientSearchTerm(query);

            queryText += `
                AND ${buildNormalizedClientSearch('razclien')} LIKE $${params.length + 1}
            `;

            params.push(`%${normalizedQuery}%`);
        }

        if (status) {
            queryText += ` AND estado = $${params.length + 1}`;
            params.push(status);
        }

        try {
            const { rows } = await pool.query(queryText, params);
            return parseInt(rows[0].count, 10);
        } catch (error) {
            console.error('Error counting clients:', error);
            throw new Error('Error counting clients');
        }
    }

    static async search({ query, limit = 10, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return [];
        }

        try {
            const normalizedQuery = normalizeClientSearchTerm(query);

            let searchQuery = `
                SELECT * 
                FROM clientes
                WHERE COALESCE(UPPER(dadobaja), '') <> 'S'
                AND ${buildNormalizedClientSearch('razclien')} LIKE $1
            `;

            const params = [`%${normalizedQuery}%`];

            searchQuery = addCodclienFilter({
                queryText: searchQuery,
                params,
                codclien,
            });

            searchQuery = addCodrepresFilter({
                queryText: searchQuery,
                params,
                codrepres,
            });

            searchQuery += `
                ORDER BY razclien ASC
                LIMIT $${params.length + 1}
            `;

            params.push(Number(limit));

            const { rows } = await pool.query(searchQuery, params);
            return rows;
        } catch (error) {
            console.error('Error searching clients:', error);
            throw new Error('Error searching clients');
        }
    }

    static async checkExisting({ query, localidad = '', limit = 8 }) {
        const normalizeWords = (value = '') =>
            value
                .toString()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');

        const normalizedWords = normalizeWords(query);
        const normalizedCompact = normalizeClientSearchTerm(query).toUpperCase();
        const normalizedLocalidad = normalizeWords(localidad);
        const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 12);

        if (normalizedCompact.length < 3) {
            return [];
        }

        // Para la búsqueda global evitamos regexp_replace + translate sobre cuatro
        // columnas a la vez. Esa consulta era innecesariamente costosa y, con una
        // conexión remota, podía acabar con la sesión cerrada por el servidor.
        const nameExpression = `
            translate(
                lower(COALESCE(razclien::text, '')),
                'áàäâãåéèëêíìïîóòöôõúùüûñç',
                'aaaaaaeeeeiiiiooooouuuunc'
            )
        `;
        const localityExpression = `
            translate(
                lower(COALESCE(localidad::text, '')),
                'áàäâãåéèëêíìïîóòöôõúùüûñç',
                'aaaaaaeeeeiiiiooooouuuunc'
            )
        `;
        const nifExpression = `
            upper(
                replace(
                    replace(
                        replace(COALESCE(nif::text, ''), ' ', ''),
                        '-', ''
                    ),
                    '.', ''
                )
            )
        `;
        const codeExpression = `upper(trim(COALESCE(codclien::text, '')))`;

        const params = [normalizedWords, normalizedCompact];
        let queryText = `
            SELECT
                codclien,
                razclien,
                localidad,
                codpais,
                codrepre,
                CASE
                    WHEN ${nifExpression} = $2 OR ${codeExpression} = $2 THEN 0
                    ELSE 1
                END AS match_priority
            FROM clientes
            WHERE COALESCE(UPPER(dadobaja), '') <> 'S'
              AND (
                    ${nameExpression} LIKE '%' || $1 || '%'
                 OR ${nifExpression} LIKE '%' || $2 || '%'
                 OR ${codeExpression} LIKE '%' || $2 || '%'
              )
        `;

        if (normalizedLocalidad) {
            params.push(normalizedLocalidad);
            queryText += ` AND ${localityExpression} LIKE '%' || $${params.length} || '%'`;
        }

        params.push(safeLimit);
        queryText += `
            ORDER BY match_priority ASC, razclien ASC, localidad ASC NULLS LAST
            LIMIT $${params.length}
        `;

        const runQuery = () => pool.query(queryText, params);
        const isTransientConnectionError = (error) => {
            const code = String(error?.code || '').toUpperCase();
            const message = String(error?.message || '');

            return ['ECONNRESET', 'EPIPE', '57P01', '57P02', '57P03'].includes(code)
                || /connection terminated|connection closed|socket hang up/i.test(message);
        };

        try {
            const { rows } = await runQuery();
            return rows;
        } catch (error) {
            if (isTransientConnectionError(error)) {
                console.warn('PostgreSQL cerró la conexión durante checkExisting; reintentando una vez...');

                try {
                    const { rows } = await runQuery();
                    return rows;
                } catch (retryError) {
                    console.error('Error checking existing clients after retry:', retryError);
                    throw new Error('Error checking existing clients');
                }
            }

            console.error('Error checking existing clients:', error);
            throw new Error('Error checking existing clients');
        }
    }

    static async userCanAccessClient({ targetCodclien, codrepres, codclien }) {
        if (codrepres === undefined && codclien === undefined) {
            return true;
        }

        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return false;
        }

        let queryText = `
            SELECT 1
            FROM clientes
            WHERE codclien = $1
        `;
        const params = [String(targetCodclien || '').trim()];

        queryText = addCodclienFilter({ queryText, params, codclien });
        queryText = addCodrepresFilter({ queryText, params, codrepres });
        queryText += ' LIMIT 1';

        const { rows } = await pool.query(queryText, params);
        return rows.length > 0;
    }

    static async getBillingHistory(codclien) {
        const queryText = `
            SELECT fecha, importe, dt1, dt2, dt3
            FROM facturacion
            WHERE codclien = $1
            ORDER BY fecha DESC
        `;

        try {
            const { rows } = await pool.query(queryText, [codclien]);
            return rows;
        } catch (error) {
            console.error('Error fetching billing history:', error);
            throw new Error('Error fetching billing history');
        }
    }

    static async getById({ codclien }) {
        const { rows } = await pool.query(
            `
                SELECT * 
                FROM clientes
                WHERE codclien = $1
            `,
            [codclien]
        );

        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodclien({ codclien }) {
        try {
            const { rows } = await pool.query(
                `
                    SELECT * 
                    FROM clientes
                    WHERE codclien = $1
                `,
                [codclien]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching client:', error);
            throw new Error('Error fetching client');
        }
    }

    static async create({ input }) {
        const {
            marcar,
            codclien,
            razclien,
            nif,
            cp,
            direccion,
            localidad,
            codpais,
            tlfno,
            codgesti,
            codtarifa,
            codforpago,
            imppedvalorados,
            impalbvalorados,
            email,
            codrepre,
            comision,
            nrb,
            asegurado,
            idcp,
            codriesgo,
            impriesgo,
            portes,
            tipportes,
            dadobaja,
            codctacontab,
            codiva,
            forenvio,
            commanual,
            bloqueado,
            fecalta,
            permitiralbsinpedido,
            reqconfirpartrabajo,
            codtippersona,
            impprenetos,
            trabajaconre,
            codprovi,
            excluirbloqdoccobrosvencidospendientes,
        } = input;

        const { rows } = await pool.query(
            `
                INSERT INTO clientes (
                    marcar,
                    codclien,
                    razclien,
                    nif,
                    cp,
                    direccion,
                    localidad,
                    codpais,
                    tlfno,
                    codgesti,
                    codtarifa,
                    codforpago,
                    imppedvalorados,
                    impalbvalorados,
                    email,
                    codrepre,
                    comision,
                    nrb,
                    asegurado,
                    idcp,
                    codriesgo,
                    impriesgo,
                    portes,
                    tipportes,
                    dadobaja,
                    codctacontab,
                    codiva,
                    forenvio,
                    commanual,
                    bloqueado,
                    fecalta,
                    permitiralbsinpedido,
                    reqconfirpartrabajo,
                    codtippersona,
                    impprenetos,
                    trabajaconre,
                    codprovi,
                    excluirbloqdoccobrosvencidospendientes
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36, $37, $38
                )
                RETURNING *;
            `,
            [
                marcar,
                codclien,
                razclien,
                nif,
                cp,
                direccion,
                localidad,
                codpais,
                tlfno,
                codgesti,
                codtarifa,
                codforpago,
                imppedvalorados,
                impalbvalorados,
                email,
                codrepre,
                comision,
                nrb,
                asegurado,
                idcp,
                codriesgo,
                impriesgo,
                portes,
                tipportes,
                dadobaja,
                codctacontab,
                codiva,
                forenvio,
                commanual,
                bloqueado,
                fecalta,
                permitiralbsinpedido,
                reqconfirpartrabajo,
                codtippersona,
                impprenetos,
                trabajaconre,
                codprovi,
                excluirbloqdoccobrosvencidospendientes,
            ]
        );

        return rows[0];
    }

    static async update({ codclien, input }) {
        const keys = Object.keys(input);

        if (keys.length === 0) {
            return null;
        }

        const fields = keys
            .map((key, index) => `"${key}" = $${index + 2}`)
            .join(', ');

        const values = Object.values(input);

        const { rows } = await pool.query(
            `
                UPDATE clientes
                SET ${fields}
                WHERE codclien = $1
                RETURNING *;
            `,
            [codclien, ...values]
        );

        return rows[0] || null;
    }

    static async delete({ codclien }) {
        const { rows } = await pool.query(
            `
                DELETE FROM clientes 
                WHERE codclien = $1 
                RETURNING *;
            `,
            [codclien]
        );

        return rows[0] || null;
    }

    static async getByProvince({ codprovi, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return [];
        }

        try {
            let queryText = `
                SELECT *
                FROM clientes
                WHERE codprovi = $1
                  AND COALESCE(UPPER(dadobaja), '') <> 'S'
            `;
            const params = [codprovi];

            queryText = addCodclienFilter({ queryText, params, codclien });
            queryText = addCodrepresFilter({ queryText, params, codrepres });
            queryText += ' ORDER BY localidad';

            const { rows } = await pool.query(queryText, params);
            return rows;
        } catch (error) {
            console.error('Error fetching clients by province:', error);
            throw new Error('Error fetching clients by province');
        }
    }

    static async getClientsWithBilling({ limit, offset, order = 'DESC', codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) {
            return [];
        }

        const allowedOrders = ['ASC', 'DESC'];
        const safeOrder = allowedOrders.includes(String(order).toUpperCase())
            ? String(order).toUpperCase()
            : 'DESC';

        let queryText = `
        SELECT c.codclien, c.razclien, c.localidad, c.email,
               COALESCE(SUM(p.importe * 
                             (1 - COALESCE(p.dt1, 0) / 100) * 
                             (1 - COALESCE(p.dt2, 0) / 100) * 
                             (1 - COALESCE(p.dt3, 0) / 100)), 0) AS total_billing
        FROM clientes c
        LEFT JOIN pedventa p ON c.codclien = p.codclien
        WHERE COALESCE(UPPER(c.dadobaja), '') <> 'S'
    `;

        const params = [];

        queryText = addCodclienFilter({
            queryText,
            params,
            codclien,
            tableAlias: 'c',
        });

        queryText = addCodrepresFilter({
            queryText,
            params,
            codrepres,
            tableAlias: 'c',
        });

        queryText += `
        GROUP BY c.codclien, c.razclien, c.localidad, c.email
        ORDER BY total_billing ${safeOrder}
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2};
    `;

        params.push(Number(limit), Number(offset));

        try {
            const { rows } = await pool.query(queryText, params);
            return rows;
        } catch (error) {
            console.error('Error fetching clients with billing:', error);
            throw new Error('Error fetching clients with billing');
        }
    }

    static async getResumenPorPais(ejercicio) {
        try {
            const result = await pool.query(
                `
                    SELECT 
                        UPPER(c.codpais) AS codpais, 
                        COUNT(DISTINCT p.codclien) AS clientes,
                        COALESCE(
                            SUM(
                                CAST(COALESCE(p.importe, 0) AS numeric) *
                                (1 - CAST(COALESCE(p.dt1, 0) AS numeric) / 100.0) *
                                (1 - CAST(COALESCE(p.dt2, 0) AS numeric) / 100.0) *
                                (1 - CAST(COALESCE(p.dt3, 0) AS numeric) / 100.0)
                            ), 0
                        ) AS facturacion_total
                    FROM clientes c
                    INNER JOIN pedventa p ON c.codclien = p.codclien
                    WHERE c.codpais IS NOT NULL
                      AND p.ejercicio = $1
                    GROUP BY UPPER(c.codpais)
                `,
                [ejercicio.toString()]
            );

            const resumen = {};

            for (const row of result.rows) {
                resumen[row.codpais] = {
                    clientes: parseInt(row.clientes, 10),
                    facturacion_total: parseFloat(row.facturacion_total),
                };
            }

            return resumen;
        } catch (error) {
            console.error('Error en getResumenPorPais:', error);
            throw new Error('Error al obtener el resumen por país');
        }
    }

    static async getResumenPorProvincias(anio) {
        try {
            const result = await pool.query(
                `
                    SELECT 
                        c.codprovi AS provincia, 
                        COUNT(DISTINCT p.codclien) AS clientes,
                        COALESCE(
                            SUM(
                                CAST(COALESCE(p.importe, 0) AS numeric) *
                                (1 - CAST(COALESCE(p.dt1, 0) AS numeric) / 100.0) *
                                (1 - CAST(COALESCE(p.dt2, 0) AS numeric) / 100.0) *
                                (1 - CAST(COALESCE(p.dt3, 0) AS numeric) / 100.0)
                            ), 0
                        ) AS facturacion_total
                    FROM clientes c
                    INNER JOIN pedventa p ON c.codclien = p.codclien
                    WHERE c.codprovi IS NOT NULL
                      AND p.ejercicio = $1
                    GROUP BY c.codprovi
                `,
                [anio]
            );

            const resumen = {};

            for (const row of result.rows) {
                resumen[row.provincia] = {
                    clientes: parseInt(row.clientes, 10),
                    facturacion_total: parseFloat(row.facturacion_total),
                };
            }

            return resumen;
        } catch (error) {
            console.error('Error en getResumenPorProvincias:', error);
            throw new Error('Error al obtener el resumen por provincia');
        }
    }
}