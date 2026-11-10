/**
 * Avances físicos del preparador CDI TEST. Nunca invoca funciones de escritura ERP.
 * Cada actualización tiene versión optimista y requiere un bloqueo de pedido vigente.
 * No admite traspasar borradores entre operarios ni empresas silenciosamente.
 */
import { CdiTestError } from './cdiTestClient.js';
import { buildCdiOrderLockKey } from './sgaCdiTestOperations.js';
import { normalizeSgaLeaseToken } from './sgaOrderLocks.js';

const error = (status, code, message) => { throw new CdiTestError(status, code, message); };
const field = (value, max, name, optional = false) => {
    if (optional && (value === '' || value == null)) return '';
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) {
        error(400, 'CDI_CHECKPOINT_INVALID', `${name} no es válido.`);
    }
    return value.trim();
};
const identityOf = (raw) => {
    if (raw?.tipo !== 'PC') error(400, 'CDI_CHECKPOINT_ONLY_SALES', 'Solo se guardan pedidos de venta PC.');
    const anio = field(raw?.anio, 4, 'Ejercicio');
    if (!/^\d{4}$/.test(anio)) error(400, 'CDI_CHECKPOINT_YEAR', 'Ejercicio inválido.');
    return { tipo: 'PC', anio, serie: field(raw?.serie, 5, 'Serie'), clave: field(raw?.clave, 10, 'Número') };
};

export function validatePickingCheckpoint(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        error(400, 'CDI_CHECKPOINT_INVALID', 'El avance debe ser un objeto.');
    }
    const picks = value.picks;
    if (!Array.isArray(picks) || picks.length > 100) error(400, 'CDI_CHECKPOINT_LINES', 'Máximo 100 líneas por avance.');
    const normalized = picks.map((p) => ({
        idlinea: field(p?.idlinea, 40, 'ID de línea'),
        cantidad: field(p?.cantidad, 32, 'Cantidad', true),
        nserie: field(p?.nserie, 35, 'Lote', true),
        ubicacion: field(p?.ubicacion, 10, 'Ubicación', true),
    }));
    // Guardar un corte a medio introducir es válido. Enviar al ERP sigue exigiendo
    // las validaciones independientes del circuito de confirmación.
    for (const p of normalized) {
        if (p.cantidad && !/^\d{1,12}(?:[.,]\d{1,6})?$/.test(p.cantidad)) {
            error(400, 'CDI_CHECKPOINT_QUANTITY', 'La cantidad incompleta contiene caracteres no válidos.');
        }
    }
    const settings = value.docSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        error(400, 'CDI_CHECKPOINT_SETTINGS', 'Faltan los datos del albarán.');
    }
    return {
        picks: normalized,
        docSettings: {
            fecha: field(settings.fecha, 10, 'Fecha'),
            serie_destino: field(settings.serie_destino, 5, 'Serie del albarán', true),
            codalmacen: field(settings.codalmacen, 2, 'Almacén', true),
        },
    };
}

/**
 * El envío debe corresponder EXACTAMENTE al avance confirmado en PostgreSQL.
 * Comparar cantidades con enteros decimales evita confundir 3,50 y 3.5,
 * pero los lotes, las ubicaciones y el orden de los cortes siguen siendo exactos.
 */
export function assertSavedPickingMatches(checkpoint, input) {
    if (!checkpoint || checkpoint.status !== 'ACTIVE' || !Number.isSafeInteger(input?.checkpointVersion)
        || input.checkpointVersion < 1 || checkpoint.version !== input.checkpointVersion) {
        error(409, 'CDI_CHECKPOINT_OUTDATED', 'La preparación no está activa o no coincide con la versión guardada. Reanuda y revisa el avance antes de enviar.');
    }
    const saved = validatePickingCheckpoint(checkpoint.progress);
    const requested = validatePickingCheckpoint({
        picks: Array.isArray(input?.lineas) ? input.lineas.map((line) => ({
            idlinea: line?.idlinea, cantidad: line?.cantidad,
            nserie: line?.nserie || '', ubicacion: line?.ubicacion || '',
        })) : null,
        docSettings: { fecha: input?.fecha, serie_destino: input?.serie_destino, codalmacen: input?.codalmacen },
    });
    const toMicro = (value) => {
        const v = String(value).replace(',', '.');
        if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(v)) return null;
        const [whole, fraction = ''] = v.split('.');
        return (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
    };
    const same = (a, b) => a.length === b.length && a.every((row, i) =>
        row.idlinea === b[i].idlinea && row.nserie === b[i].nserie
        && row.ubicacion === b[i].ubicacion && toMicro(row.cantidad) !== null
        && toMicro(row.cantidad) === toMicro(b[i].cantidad));
    if (!same(saved.picks, requested.picks) ||
        ['fecha', 'serie_destino', 'codalmacen'].some((key) => saved.docSettings[key] !== requested.docSettings[key])) {
        error(409, 'CDI_CHECKPOINT_MISMATCH', 'Hay cortes o datos del albarán que aún no coinciden con el avance guardado. No se ha enviado nada a CDI.');
    }
    return true;
}

export function createSgaCdiPickingCheckpointService({ pool, locks, testStatus }) {
    if (!pool || !locks || !testStatus) throw new Error('El servicio necesita PostgreSQL, bloqueos y configuración CDI TEST.');
    let initialized;
    const ensureSchema = () => {
        // Solo después de aplicar el SQL de migración: elimina DDL de la ruta de trabajo.
        if (!initialized && process.env.SGA_CDI_SCHEMA_PREPARED === 'true') initialized = Promise.resolve();
        if (!initialized) initialized = pool.query(`
            CREATE TABLE IF NOT EXISTS sga_cdi_picking_checkpoints (
                company varchar(10) NOT NULL,
                order_key varchar(180) NOT NULL,
                operator_id varchar(128) NOT NULL,
                identity_data jsonb NOT NULL,
                progress_data jsonb NOT NULL,
                version integer NOT NULL DEFAULT 1,
                status varchar(20) NOT NULL DEFAULT 'ACTIVE',
                pause_reason varchar(500),
                paused_at timestamptz,
                review_reason varchar(500),
                reviewed_at timestamptz,
                updated_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (company, order_key)
            )
        `).then(() => pool.query(`ALTER TABLE sga_cdi_picking_checkpoints
            ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'ACTIVE',
            ADD COLUMN IF NOT EXISTS pause_reason varchar(500),
            ADD COLUMN IF NOT EXISTS paused_at timestamptz,
            ADD COLUMN IF NOT EXISTS review_reason varchar(500),
            ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`))
            .catch((err) => { initialized = null; throw err; });
        return initialized;
    };
    const context = async (identity, operatorId, leaseToken) => {
        const config = testStatus();
        if (!config.enabled || !config.testCompany) error(503, 'CDI_CHECKPOINT_TEST_DISABLED', 'CDI TEST no está habilitado.');
        const order = identityOf(identity);
        const token = normalizeSgaLeaseToken(leaseToken);
        if (!token) error(409, 'CDI_CHECKPOINT_LEASE_REQUIRED', 'Asigna el pedido antes de recuperar o guardar los cortes.');
        const key = buildCdiOrderLockKey(config.testCompany, order);
        const lock = await locks.verify({ orderKey: key, userId: String(operatorId), token });
        if (!lock.ok) error(409, 'CDI_CHECKPOINT_LEASE_LOST', 'La asignación ha caducado. Comprueba físicamente el pedido antes de recuperar.');
        return { company: config.testCompany, key, order, operatorId: String(operatorId) };
    };
    // Estado breve de las preparaciones propias para el listado táctil.
    // No depende de un lease vigente porque también muestra las pausadas.
    async function mine(operatorId) {
        const config = testStatus();
        if (!config.enabled || !config.testCompany) error(503, 'CDI_CHECKPOINT_TEST_DISABLED', 'CDI TEST no está habilitado.');
        await ensureSchema();
        const { rows } = await pool.query(`SELECT identity_data, status, updated_at
            FROM sga_cdi_picking_checkpoints
            WHERE company=$1 AND operator_id=$2 AND status IN ('ACTIVE','PAUSED','SEALED')
            ORDER BY updated_at DESC LIMIT 100`, [config.testCompany, String(operatorId)]);
        return { company: config.testCompany, checkpoints: rows.map((row) => ({
            identity: row.identity_data, status: row.status, updatedAt: row.updated_at,
        })) };
    }
    async function read(identity, operatorId, leaseToken) {
        const c = await context(identity, operatorId, leaseToken);
        await ensureSchema();
        const result = await pool.query(`SELECT operator_id, progress_data, version, updated_at, status,
                   pause_reason, paused_at, review_reason, reviewed_at
            FROM sga_cdi_picking_checkpoints WHERE company=$1 AND order_key=$2`, [c.company, c.key]);
        const row = result.rows[0];
        if (!row || row.status === 'ARCHIVED') return { checkpoint: null };
        if (row.operator_id !== c.operatorId) {
            error(409, 'CDI_CHECKPOINT_OTHER_OPERATOR', 'Hay un avance de otro operario. Un supervisor debe conciliarlo físicamente antes de continuar.');
        }
        return { checkpoint: { progress: row.progress_data, version: row.version, status: row.status,
            updatedAt: row.updated_at, pauseReason: row.pause_reason || null,
            pausedAt: row.paused_at || null, reviewReason: row.review_reason || null,
            reviewedAt: row.reviewed_at || null } };
    }
    async function save(input, operatorId) {
        const c = await context(input?.identity, operatorId, input?.leaseToken);
        const version = input?.version;
        if (!Number.isSafeInteger(version) || version < 0) error(400, 'CDI_CHECKPOINT_VERSION', 'Versión de avance inválida.');
        const progress = validatePickingCheckpoint(input?.progress);
        await ensureSchema();
        const result = version === 0
            ? await pool.query(`INSERT INTO sga_cdi_picking_checkpoints
                  (company, order_key, operator_id, identity_data, progress_data, version)
                VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,1)
                ON CONFLICT (company, order_key) DO UPDATE
                   SET operator_id=EXCLUDED.operator_id,
                       identity_data=EXCLUDED.identity_data,
                       progress_data=EXCLUDED.progress_data,
                       version=sga_cdi_picking_checkpoints.version+1,
                       status='ACTIVE', updated_at=now()
                 WHERE sga_cdi_picking_checkpoints.status='ARCHIVED'
                RETURNING version, updated_at`,
                [c.company, c.key, c.operatorId, JSON.stringify(c.order), JSON.stringify(progress)])
            : await pool.query(`UPDATE sga_cdi_picking_checkpoints
                SET progress_data=$4::jsonb, version=version+1, updated_at=now()
                WHERE company=$1 AND order_key=$2 AND operator_id=$3 AND version=$5 AND status='ACTIVE'
                RETURNING version, updated_at`,
                [c.company, c.key, c.operatorId, JSON.stringify(progress), version]);
        if (!result.rows.length) {
            error(409, 'CDI_CHECKPOINT_CONFLICT', 'El avance ha cambiado en otro dispositivo o pertenece a otro operario; vuelve a cargarlo.');
        }
        return { checkpoint: { progress, version: result.rows[0].version,
            status: 'ACTIVE', updatedAt: result.rows[0].updated_at } };
    }
    const reasonValue = (reason, kind) => {
        if (typeof reason !== 'string' || reason.trim().length < 15 || reason.length > 500) {
            error(400, 'CDI_CHECKPOINT_REASON', `Describe ${kind} (15 a 500 caracteres).`);
        }
        return reason.trim();
    };
    // Una pausa es una transición persistente, nunca una liberación del pedido ni
    // una confirmación de albarán. El cambio de versión invalida tablets antiguas.
    async function pause(input, operatorId) {
        const c = await context(input?.identity, operatorId, input?.leaseToken);
        const version = input?.version;
        if (!Number.isSafeInteger(version) || version < 1) error(400, 'CDI_CHECKPOINT_VERSION', 'Versión guardada inválida.');
        const reason = reasonValue(input?.reason, 'por qué queda a medias');
        await ensureSchema();
        const { rows } = await pool.query(`UPDATE sga_cdi_picking_checkpoints
            SET status='PAUSED', version=version+1, pause_reason=$5, paused_at=now(), updated_at=now()
            WHERE company=$1 AND order_key=$2 AND operator_id=$3
              AND status='ACTIVE' AND version=$4
              AND NOT EXISTS (
                SELECT 1 FROM sga_cdi_test_operations AS op
                WHERE op.company=$1 AND op.order_key=$2
                  AND op.state IN ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE',
                                   'CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING')
              )
            RETURNING version, updated_at, paused_at`,
        [c.company, c.key, c.operatorId, version, reason]);
        if (!rows.length) error(409, 'CDI_CHECKPOINT_PAUSE_CONFLICT',
            'No se puede pausar: el avance cambió o ya existe una operación de albarán. Revisa su estado antes de continuar.');
        return { checkpoint: { status: 'PAUSED', version: rows[0].version,
            updatedAt: rows[0].updated_at, pausedAt: rows[0].paused_at } };
    }
    async function resume(input, operatorId) {
        const c = await context(input?.identity, operatorId, input?.leaseToken);
        const version = input?.version;
        if (!Number.isSafeInteger(version) || version < 1) error(400, 'CDI_CHECKPOINT_VERSION', 'Versión guardada inválida.');
        const reason = reasonValue(input?.reason, 'la revisión física antes de reanudar');
        await ensureSchema();
        const { rows } = await pool.query(`UPDATE sga_cdi_picking_checkpoints
            SET status='ACTIVE', version=version+1, review_reason=$5,
                reviewed_at=now(), updated_at=now()
            WHERE company=$1 AND order_key=$2 AND operator_id=$3
              AND status='PAUSED' AND version=$4
            RETURNING version, updated_at, reviewed_at`,
        [c.company, c.key, c.operatorId, version, reason]);
        if (!rows.length) error(409, 'CDI_CHECKPOINT_RESUME_CONFLICT',
            'Otro dispositivo ha cambiado el estado de esta preparación. No se puede reanudar sin revisar el estado.');
        return { checkpoint: { status: 'ACTIVE', version: rows[0].version,
            updatedAt: rows[0].updated_at, reviewedAt: rows[0].reviewed_at } };
    }
    // A partir de aquí la petición CDI queda congelada: no pueden seguir entrando
    // cambios de una segunda pestaña. El AC todavía NO se ha enviado al ERP.
    async function seal(input, operatorId) {
        const c = await context(input?.identity, operatorId, input?.leaseToken);
        if (!Number.isSafeInteger(input?.checkpointVersion) || input.checkpointVersion < 1) {
            error(400, 'CDI_CHECKPOINT_VERSION', 'Versión guardada inválida.');
        }
        await ensureSchema();
        const { rows } = await pool.query(`UPDATE sga_cdi_picking_checkpoints
            SET status='SEALED', updated_at=now()
            WHERE company=$1 AND order_key=$2 AND operator_id=$3
              AND status='ACTIVE' AND version=$4 RETURNING version`,
        [c.company, c.key, c.operatorId, input.checkpointVersion]);
        if (!rows.length) error(409, 'CDI_CHECKPOINT_SEAL_CONFLICT',
            'La preparación está pausada, cambió en otra tablet o ya quedó cerrada. Consulta Mis operaciones y no crees otro albarán.');
        return { sealed: true };
    }
    async function assertSealed(identity, operatorId, leaseToken) {
        const c = await context(identity, operatorId, leaseToken);
        await ensureSchema();
        const { rows } = await pool.query(`SELECT status FROM sga_cdi_picking_checkpoints
            WHERE company=$1 AND order_key=$2 AND operator_id=$3`,
        [c.company, c.key, c.operatorId]);
        if (rows[0]?.status !== 'SEALED') error(409, 'CDI_CHECKPOINT_NOT_SEALED',
            'La preparación no está sellada en PostgreSQL. Consulta la operación pendiente; no se ha enviado nada a CDI.');
        return true;
    }
    async function archive(input, operatorId, operations) {
        const c = await context(input?.identity, operatorId, input?.leaseToken);
        const operationId = input?.operationId;
        if (typeof operationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(operationId)) {
            error(400, 'CDI_CHECKPOINT_OPERATION', 'Falta la referencia de la operación CDI.');
        }
        const operation = await operations.read(operationId, String(operatorId));
        const origin = operation?.before?.identity;
        if (operation?.company !== c.company || !origin ||
            ['tipo', 'anio', 'serie', 'clave'].some((part) => origin[part] !== c.order[part]) ||
            operation?.handoff?.status !== 'READY_FOR_ERP_INVOICING') {
            error(409, 'CDI_CHECKPOINT_NOT_VERIFIED', 'El albarán debe estar verificado antes de cerrar el avance.');
        }
        await ensureSchema();
        const result = await pool.query(`UPDATE sga_cdi_picking_checkpoints
            SET status='ARCHIVED', updated_at=now()
            WHERE company=$1 AND order_key=$2 AND operator_id=$3 AND status IN ('ACTIVE','SEALED')
            RETURNING version`, [c.company, c.key, c.operatorId]);
        return { archived: result.rows.length > 0 };
    }
    return Object.freeze({ read, mine, save, pause, resume, seal, assertSealed, archive });
}
