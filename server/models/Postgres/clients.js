import pg from 'pg';
import dotenv from 'dotenv';
import { CLIENT_FIELDS } from '../../schemas/clients.js';

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

// El listado y el orden comercial deben usar exactamente los mismos filtros e importes.
const buildClientWhere = ({ codpais, codprovi, query, status, codrepres, codclien }, alias = 'c') => {
    let queryText = `WHERE COALESCE(UPPER(TRIM(${alias}.dadobaja::text)), '') <> 'S'`;
    const params = [];
    queryText = addCodclienFilter({ queryText, params, codclien, tableAlias: alias });
    queryText = addCodrepresFilter({ queryText, params, codrepres, tableAlias: alias });

    if (codpais) {
        params.push(codpais);
        queryText += ` AND ${alias}.codpais = $${params.length}`;
    }
    if (codprovi) {
        params.push(codprovi);
        queryText += ` AND ${alias}.codprovi = $${params.length}`;
    }
    if (query && normalizeClientSearchTerm(query)) {
        const value = `%${normalizeClientSearchTerm(query)}%`;
        params.push(value);
        queryText += ` AND (
            ${buildNormalizedClientSearch(`${alias}.razclien`)} LIKE $${params.length}
            OR ${buildNormalizedClientSearch(`${alias}.codclien::text`)} LIKE $${params.length}
        )`;
    }
    if (status) {
        params.push(status);
        queryText += ` AND ${alias}.estado = $${params.length}`;
    }
    return { queryText, params };
};

// Se trata del importe NETO DE LÍNEAS DE PEDIDO, no de facturas emitidas.
// Los descuentos son sucesivos; no redondeamos el porcentaje a un entero.
const netOrdersExpression = `SUM(GREATEST(
    COALESCE(p.importe, 0)::numeric *
    (CASE WHEN COALESCE(p.dt1, 0) > 0 THEN 1 - p.dt1::numeric / 100 ELSE 1 END) *
    (CASE WHEN COALESCE(p.dt2, 0) > 0 THEN 1 - p.dt2::numeric / 100 ELSE 1 END) *
    (CASE WHEN COALESCE(p.dt3, 0) > 0 THEN 1 - p.dt3::numeric / 100 ELSE 1 END),
    0
))`;

const clientActivitySelect = `
    COALESCE((SELECT ${netOrdersExpression} FROM pedventa p WHERE p.codclien = c.codclien), 0) AS total_billing,
    (SELECT MAX(v.fecha) FROM visitas v
     WHERE v.cliente_id = c.codclien AND v.estado = 'completada' AND v.fecha <= NOW()) AS "ultimaVisita"
`;

export class ClienteModel {
    static async getAll({ offset = 0, limit = 10, codpais, codprovi, query, status, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) return [];
        const { queryText, params } = buildClientWhere({ codpais, codprovi, query, status, codrepres, codclien });
        // Se pagina antes de calcular las métricas para no procesar miles de clientes
        // cuando el orden es por localidad.
        const sql = `
            WITH pagina AS (
                SELECT c.* FROM clientes c ${queryText}
                ORDER BY c.localidad ASC NULLS LAST, c.razclien ASC, c.codclien ASC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            )
            SELECT c.*, ${clientActivitySelect}
            FROM pagina c
            ORDER BY c.localidad ASC NULLS LAST, c.razclien ASC, c.codclien ASC
        `;
        const { rows } = await pool.query(sql, [...params, Number(limit), Number(offset)]);
        return rows;
    }

    static async getCount({ codpais, codprovi, query, status, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) return 0;
        const { queryText, params } = buildClientWhere({ codpais, codprovi, query, status, codrepres, codclien });
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM clientes c ${queryText}`, params);
        return rows[0]?.total || 0;
    }

    static async search({ query, limit = 10, codrepres, codclien }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) return [];
        const { queryText, params } = buildClientWhere({ query, codrepres, codclien });
        const sql = `SELECT c.codclien, c.razclien, c.localidad, c.codpais
                     FROM clientes c ${queryText}
                     ORDER BY c.razclien ASC, c.codclien ASC LIMIT $${params.length + 1}`;
        const { rows } = await pool.query(sql, [...params, Math.min(Math.max(Number(limit) || 10, 1), 50)]);
        return rows;
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

    static async update({ codclien, input, allowRepresentativeChange = false }) {
        const keys = Object.keys(input);
        const editable = new Set(CLIENT_FIELDS.filter((field) => field !== 'codclien' && (field !== 'codrepre' || allowRepresentativeChange)));
        if (keys.length === 0 || keys.some((key) => !editable.has(key))) {
            throw new Error('Campos de cliente no autorizados.');
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

    static async getClientsWithBilling({ limit = 10, offset = 0, order = 'DESC', codrepres, codclien, codpais, codprovi, query, status }) {
        if (hasEmptyCodrepresFilter(codrepres) || hasEmptyCodclienFilter(codclien)) return [];
        const safeOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const { queryText, params } = buildClientWhere({ codpais, codprovi, query, status, codrepres, codclien });
        const sql = `
            SELECT c.*, ${clientActivitySelect}
            FROM clientes c ${queryText}
            ORDER BY total_billing ${safeOrder}, c.razclien ASC, c.codclien ASC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const { rows } = await pool.query(sql, [...params, Number(limit), Number(offset)]);
        return rows;
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