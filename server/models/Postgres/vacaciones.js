import pool from '../../db/pool.js';

const DEFAULT_DIAS_ANUALES = 24;
const DEFAULT_MANDATORY_MMDD = ['12-24', '12-31'];
const DEFAULT_DEPT_CAPACITY_RATIO = 0.33;
const DEFAULT_AJUSTES_TABLE = 'vacaciones_ajustes';
const EXEMPT_CAPACITY_DEPARTMENTS = ['ceo', 'compras', 'marketing', 'confección'];

function isValidMmDdForYear(value, year) {
    const raw = String(value || '').trim();
    const match = /^(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return false;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const probe = new Date(Date.UTC(Number(year), month - 1, day));
    return probe.getUTCFullYear() === Number(year)
        && probe.getUTCMonth() === month - 1
        && probe.getUTCDate() === day;
}

function normalizeDepartmentName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function resolveAjustesTableName() {
    const configured = String(process.env.VACACIONES_AJUSTES_TABLE || DEFAULT_AJUSTES_TABLE).trim().toLowerCase();
    return /^[a-z_][a-z0-9_]*$/.test(configured) ? configured : DEFAULT_AJUSTES_TABLE;
}

let checkedUserAllowanceColumn = false;
let hasUserAllowanceColumn = false;
let checkedUserDepartmentColumn = false;
let hasUserDepartmentColumn = false;

let checkedAjustesColumns = false;
let ajustesDiasColumn = null;
let ajustesYearColumn = null;

let ensureTablePromise = null;
const VACACIONES_SCHEMA_LOCK_KEY = 'vacaciones-schema-init-v2';

export class VacacionesModel {
    static canManageVacaciones(role) {
        return ['admin', 'rrhh'].includes(String(role || '').toLowerCase());
    }

    static getAjustesTable() {
        return resolveAjustesTableName();
    }

    static isCapacityExemptDepartment(departamento) {
        const normalized = normalizeDepartmentName(departamento);
        const configured = String(process.env.VACACIONES_EXEMPT_DEPARTMENTS || '')
            .split(',')
            .map((item) => normalizeDepartmentName(item))
            .filter(Boolean);

        const targetList = configured.length > 0
            ? configured
            : EXEMPT_CAPACITY_DEPARTMENTS.map((item) => normalizeDepartmentName(item));

        return targetList.includes(normalized);
    }

    static async ensureTable() {
        if (ensureTablePromise) {
            return ensureTablePromise;
        }

        ensureTablePromise = (async () => {
            const client = await pool.connect();
            let lockAcquired = false;

            try {
                await client.query('SELECT pg_advisory_lock(hashtext($1))', [VACACIONES_SCHEMA_LOCK_KEY]);
                lockAcquired = true;
            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_empleados (
            id SERIAL PRIMARY KEY,
            empleado_id INT NOT NULL,
            empleado_nombre VARCHAR(120) NOT NULL,
            departamento VARCHAR(80) NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NOT NULL,
            dias_solicitados INT NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            motivo TEXT,
            empleado_role VARCHAR(80),
            comentario_rrhh TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS empleado_role VARCHAR(80);`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS revisado_por INT;`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS revisado_at TIMESTAMP;`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS origen VARCHAR(30) NOT NULL DEFAULT 'empleado';`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS excepcion_aprobada BOOLEAN NOT NULL DEFAULT FALSE;`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS excepcion_motivo TEXT;`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS excepcion_por INT;`);
            await client.query(`ALTER TABLE vacaciones_empleados ADD COLUMN IF NOT EXISTS excepcion_at TIMESTAMP;`);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_empleados_empleado_year_idx ON vacaciones_empleados(empleado_id, fecha_inicio, estado);`);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_empleados_solape_idx ON vacaciones_empleados(fecha_inicio, fecha_fin, estado, departamento);`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_semanas_bloqueadas (
            id SERIAL PRIMARY KEY,
            departamento VARCHAR(80),
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NOT NULL,
            motivo TEXT,
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_semanas_bloqueadas_fechas_idx ON vacaciones_semanas_bloqueadas(fecha_inicio, fecha_fin, activa);`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_no_laborables (
            id SERIAL PRIMARY KEY,
            fecha DATE NOT NULL UNIQUE,
            descripcion TEXT,
            ambito VARCHAR(120) DEFAULT 'Montilla, Córdoba, España',
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);



            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_reglas_cupo (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('departamento', 'rol')),
            valor VARCHAR(80) NOT NULL,
            max_personas INT NOT NULL CHECK (max_personas >= 1),
            descripcion TEXT,
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (tipo, valor)
          );
        `);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_operacion_locks (
            lock_key VARCHAR(80) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_configuracion_anual (
            year INT PRIMARY KEY,
            dias_base_default NUMERIC(8,2) NOT NULL DEFAULT 24,
            antelacion_minima_dias INT NOT NULL DEFAULT 21,
            max_dias_consecutivos INT NOT NULL DEFAULT 30,
            fechas_obligatorias JSONB NOT NULL DEFAULT '["12-24","12-31"]'::jsonb,
            permitir_solicitudes BOOLEAN NOT NULL DEFAULT TRUE,
            notas TEXT,
            updated_by INT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_cupos_anuales (
            empleado_id INT NOT NULL,
            year INT NOT NULL,
            dias_base NUMERIC(8,2) NOT NULL,
            fuente VARCHAR(30) NOT NULL DEFAULT 'apertura',
            created_by INT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (empleado_id, year),
            CONSTRAINT vacaciones_cupos_anuales_empleado_fk
              FOREIGN KEY (empleado_id) REFERENCES usuarios(id)
              ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT vacaciones_cupos_anuales_created_by_fk
              FOREIGN KEY (created_by) REFERENCES usuarios(id)
              ON UPDATE CASCADE ON DELETE SET NULL
          );
        `);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_participantes (
            empleado_id INT PRIMARY KEY,
            participa BOOLEAN NOT NULL DEFAULT TRUE,
            acceso_modulo BOOLEAN NOT NULL DEFAULT TRUE,
            notas TEXT,
            updated_by INT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT vacaciones_participantes_empleado_fk
              FOREIGN KEY (empleado_id) REFERENCES usuarios(id)
              ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT vacaciones_participantes_updated_by_fk
              FOREIGN KEY (updated_by) REFERENCES usuarios(id)
              ON UPDATE CASCADE ON DELETE SET NULL
          );
        `);
            await client.query(`ALTER TABLE vacaciones_participantes ADD COLUMN IF NOT EXISTS acceso_modulo BOOLEAN NOT NULL DEFAULT TRUE;`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_auditoria (
            id BIGSERIAL PRIMARY KEY,
            accion VARCHAR(60) NOT NULL,
            entidad_tipo VARCHAR(40) NOT NULL,
            entidad_id INT,
            empleado_id INT,
            actor_id INT,
            actor_nombre VARCHAR(160),
            actor_role VARCHAR(80),
            year INT,
            detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_auditoria_year_idx ON vacaciones_auditoria(year, created_at DESC);`);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_auditoria_empleado_idx ON vacaciones_auditoria(empleado_id, created_at DESC);`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_notificaciones (
            id BIGSERIAL PRIMARY KEY,
            usuario_id INT NOT NULL,
            tipo VARCHAR(40) NOT NULL DEFAULT 'info',
            titulo VARCHAR(180) NOT NULL,
            mensaje TEXT,
            solicitud_id INT,
            leida BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT vacaciones_notificaciones_usuario_fk
              FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
              ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT vacaciones_notificaciones_solicitud_fk
              FOREIGN KEY (solicitud_id) REFERENCES vacaciones_empleados(id)
              ON UPDATE CASCADE ON DELETE CASCADE
          );
        `);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_notificaciones_usuario_idx ON vacaciones_notificaciones(usuario_id, leida, created_at DESC);`);

            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS cerrado BOOLEAN NOT NULL DEFAULT FALSE;`);
            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMP;`);
            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS cerrado_by INT;`);
            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS arrastre_permitido BOOLEAN NOT NULL DEFAULT FALSE;`);
            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS arrastre_max_dias NUMERIC(8,2) NOT NULL DEFAULT 0;`);
            await client.query(`ALTER TABLE vacaciones_configuracion_anual ADD COLUMN IF NOT EXISTS arrastre_limite_mmdd VARCHAR(5) NOT NULL DEFAULT '03-31';`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_arrastres (
            empleado_id INT NOT NULL,
            source_year INT NOT NULL,
            target_year INT NOT NULL,
            dias NUMERIC(8,2) NOT NULL DEFAULT 0,
            limite_fecha DATE NOT NULL,
            created_by INT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (empleado_id, target_year),
            FOREIGN KEY (empleado_id) REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL
          );
        `);
            await client.query(`CREATE INDEX IF NOT EXISTS vacaciones_arrastres_source_idx ON vacaciones_arrastres(source_year, target_year);`);

            await client.query(`
          CREATE TABLE IF NOT EXISTS vacaciones_cambios_solicitados (
            id SERIAL PRIMARY KEY,
            solicitud_id INT NOT NULL REFERENCES vacaciones_empleados(id) ON UPDATE CASCADE ON DELETE CASCADE,
            empleado_id INT NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
            tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('modificacion', 'cancelacion')),
            fecha_inicio_nueva DATE,
            fecha_fin_nueva DATE,
            dias_nuevos INT,
            motivo TEXT,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada')),
            comentario_rrhh TEXT,
            resuelto_por INT REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL,
            resuelto_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS vacaciones_cambios_pendiente_uniq ON vacaciones_cambios_solicitados(solicitud_id) WHERE estado = 'pendiente';`);

            const ajustesTable = this.getAjustesTable();

            // ✅ Ajustes: estructura esperada (más flexible gracias a resolveAjustesColumns)
            await client.query(`
          CREATE TABLE IF NOT EXISTS ${ajustesTable} (
            id SERIAL PRIMARY KEY,
            empleado_id INT NOT NULL,
            year INT NOT NULL,
            tipo VARCHAR(40) NOT NULL,
            dias NUMERIC(8,2) NOT NULL,
            motivo TEXT,
            created_by INT,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

            await client.query(`
          ALTER TABLE ${ajustesTable}
          ADD CONSTRAINT ${ajustesTable}_empleado_fk
          FOREIGN KEY (empleado_id) REFERENCES usuarios(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
        `).catch(() => { });

            await client.query(`
          ALTER TABLE ${ajustesTable}
          ADD CONSTRAINT ${ajustesTable}_created_by_fk
          FOREIGN KEY (created_by) REFERENCES usuarios(id)
          ON UPDATE CASCADE ON DELETE SET NULL;
        `).catch(() => { });
            } finally {
                if (lockAcquired) {
                    await client
                        .query('SELECT pg_advisory_unlock(hashtext($1))', [VACACIONES_SCHEMA_LOCK_KEY])
                        .catch(() => {});
                }
                client.release();
            }
        })();

        try {
            await ensureTablePromise;
        } catch (error) {
            // Si la inicialización falla, permitimos un nuevo intento posterior.
            ensureTablePromise = null;
            throw error;
        }

        return ensureTablePromise;
    }

    static async acquireYearWriteLock(year) {
        const targetYear = Number(year) || new Date().getFullYear();
        const lockKey = `vacaciones-${targetYear}`;
        const client = await pool.connect();
        let released = false;

        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO vacaciones_operacion_locks (lock_key) VALUES ($1) ON CONFLICT (lock_key) DO NOTHING`,
                [lockKey],
            );
            await client.query(
                `SELECT lock_key FROM vacaciones_operacion_locks WHERE lock_key = $1 FOR UPDATE`,
                [lockKey],
            );
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            client.release();
            throw error;
        }

        return async () => {
            if (released) return;
            released = true;
            try {
                await client.query('COMMIT');
            } finally {
                client.release();
            }
        };
    }

    static async resolveAjustesColumns() {
        if (checkedAjustesColumns && ajustesDiasColumn && ajustesYearColumn) {
            return { diasColumn: ajustesDiasColumn, yearColumn: ajustesYearColumn };
        }

        const table = this.getAjustesTable();
        const { rows } = await pool.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = $1`,
            [table],
        );

        const available = new Set(rows.map((row) => String(row.column_name || '').toLowerCase()));

        const dayCandidates = ['dias', 'dias_ajuste', 'cantidad', 'valor', 'ajuste_dias'];
        const yearCandidates = ['year', 'ano', 'anio', 'ejercicio'];

        ajustesDiasColumn = dayCandidates.find((candidate) => available.has(candidate)) || null;
        ajustesYearColumn = yearCandidates.find((candidate) => available.has(candidate)) || null;

        if (!ajustesDiasColumn) {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS dias NUMERIC(8,2) NOT NULL DEFAULT 0`);
            ajustesDiasColumn = 'dias';
        }

        if (!ajustesYearColumn) {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS year INT`);
            ajustesYearColumn = 'year';
        }

        checkedAjustesColumns = true;
        return { diasColumn: ajustesDiasColumn, yearColumn: ajustesYearColumn };
    }

    static async checkUserAllowanceColumn() {
        if (checkedUserAllowanceColumn) return hasUserAllowanceColumn;

        const { rows } = await pool.query(
            `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usuarios'
          AND column_name = 'dias_vacaciones_anuales'
      ) AS exists_column;`,
        );

        hasUserAllowanceColumn = Boolean(rows[0]?.exists_column);
        checkedUserAllowanceColumn = true;
        return hasUserAllowanceColumn;
    }

    static async checkUserDepartmentColumn() {
        if (checkedUserDepartmentColumn) return hasUserDepartmentColumn;

        const { rows } = await pool.query(
            `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usuarios'
          AND column_name = 'departamento'
      ) AS exists_column;`,
        );

        hasUserDepartmentColumn = Boolean(rows[0]?.exists_column);
        checkedUserDepartmentColumn = true;
        return hasUserDepartmentColumn;
    }

    static async getUserAnnualAllowance(userId, fallbackAllowance = DEFAULT_DIAS_ANUALES) {
        const fallback = Number(fallbackAllowance) || DEFAULT_DIAS_ANUALES;
        const hasColumn = await this.checkUserAllowanceColumn();
        if (!hasColumn) return fallback;

        const { rows } = await pool.query(
            'SELECT COALESCE(dias_vacaciones_anuales, $2) AS allowance FROM usuarios WHERE id = $1',
            [userId, fallback],
        );

        return Number(rows[0]?.allowance ?? fallback);
    }


    static async getAnnualAllowanceSnapshot({ userId, year }) {
        const { rows } = await pool.query(
            `SELECT empleado_id, year, dias_base, fuente, created_by, created_at, updated_at
             FROM vacaciones_cupos_anuales
             WHERE empleado_id = $1 AND year = $2`,
            [userId, year],
        );
        return rows[0] || null;
    }

    static async getUserAllowanceForYear({ userId, year, fallbackAllowance = DEFAULT_DIAS_ANUALES, freezeIfMissing = false, createdBy = null }) {
        const targetYear = Number(year) || new Date().getFullYear();
        const existing = await this.getAnnualAllowanceSnapshot({ userId, year: targetYear });
        if (existing) {
            return {
                allowance: Number(existing.dias_base || 0),
                congelado: true,
                fuente: existing.fuente || 'apertura',
                congelado_at: existing.created_at || null,
            };
        }

        const allowance = await this.getUserAnnualAllowance(userId, fallbackAllowance);
        if (!freezeIfMissing) {
            return { allowance, congelado: false, fuente: 'actual', congelado_at: null };
        }

        const { rows } = await pool.query(
            `INSERT INTO vacaciones_cupos_anuales (empleado_id, year, dias_base, fuente, created_by)
             VALUES ($1, $2, $3, 'incorporacion', $4)
             ON CONFLICT (empleado_id, year) DO NOTHING
             RETURNING *`,
            [userId, targetYear, allowance, createdBy || null],
        );

        const snapshot = rows[0] || await this.getAnnualAllowanceSnapshot({ userId, year: targetYear });
        return {
            allowance: Number(snapshot?.dias_base ?? allowance),
            congelado: Boolean(snapshot),
            fuente: snapshot?.fuente || 'actual',
            congelado_at: snapshot?.created_at || null,
        };
    }

    static async snapshotAnnualAllowances({ year, fallbackAllowance = DEFAULT_DIAS_ANUALES, createdBy = null }) {
        const targetYear = Number(year) || new Date().getFullYear();
        const fallback = Number(fallbackAllowance) || DEFAULT_DIAS_ANUALES;
        const hasAllowanceColumn = await this.checkUserAllowanceColumn();
        const allowanceExpression = hasAllowanceColumn
            ? 'COALESCE(u.dias_vacaciones_anuales, $2)::numeric'
            : '$2::numeric';

        const inserted = await pool.query(
            `INSERT INTO vacaciones_cupos_anuales (empleado_id, year, dias_base, fuente, created_by)
             SELECT u.id, $1, ${allowanceExpression}, 'apertura', $3
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE COALESCE(vp.participa, TRUE) = TRUE
             ON CONFLICT (empleado_id, year) DO NOTHING
             RETURNING empleado_id`,
            [targetYear, fallback, createdBy || null],
        );

        const stats = await this.getAnnualAllowanceSnapshotStats(targetYear);
        return { ...stats, creados_ahora: inserted.rowCount || 0 };
    }

    static async getAnnualAllowanceSnapshotStats(year) {
        const targetYear = Number(year) || new Date().getFullYear();
        const { rows } = await pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE COALESCE(vp.participa, TRUE) = TRUE)::int AS total,
               COUNT(*)::int AS total_historico,
               MIN(ca.created_at) AS primera_foto,
               MAX(ca.created_at) AS ultima_foto
             FROM vacaciones_cupos_anuales ca
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = ca.empleado_id
             WHERE ca.year = $1`,
            [targetYear],
        );
        return {
            total: Number(rows[0]?.total || 0),
            total_historico: Number(rows[0]?.total_historico || 0),
            primera_foto: rows[0]?.primera_foto || null,
            ultima_foto: rows[0]?.ultima_foto || null,
        };
    }

    static async getUserDepartment({ userId, fallbackRole }) {
        const hasColumn = await this.checkUserDepartmentColumn();
        if (!hasColumn) return fallbackRole || 'general';

        const { rows } = await pool.query(
            `SELECT COALESCE(NULLIF(TRIM(departamento), ''), $2) AS departamento
       FROM usuarios
       WHERE id = $1`,
            [userId, fallbackRole || 'general'],
        );

        return rows[0]?.departamento || fallbackRole || 'general';
    }

    static async isVacationParticipant(userId) {
        const { rows } = await pool.query(
            `SELECT COALESCE(vp.participa, TRUE) AS participa
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE u.id = $1`,
            [userId],
        );
        return rows.length > 0 && rows[0].participa !== false;
    }

    static async canAccessVacationModule({ userId, role }) {
        if (String(role || '').trim().toLowerCase() === 'admin') return true;

        const { rows } = await pool.query(
            `SELECT COALESCE(vp.acceso_modulo, TRUE) AS acceso_modulo
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE u.id = $1`,
            [userId],
        );

        return rows.length > 0 && rows[0].acceso_modulo !== false;
    }

    static async getVacationUserSettings(userId) {
        const { rows } = await pool.query(
            `SELECT
               u.id AS empleado_id,
               COALESCE(NULLIF(TRIM(u.role), ''), 'user') AS role,
               COALESCE(vp.participa, TRUE) AS participa,
               COALESCE(vp.acceso_modulo, TRUE) AS acceso_modulo,
               vp.notas,
               vp.updated_at
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE u.id = $1`,
            [userId],
        );
        return rows[0] || null;
    }

    static async listParticipants() {
        const { rows } = await pool.query(
            `SELECT
               u.id AS empleado_id,
               COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'Empleado ' || u.id::text) AS empleado_nombre,
               COALESCE(NULLIF(TRIM(u.role), ''), 'user') AS role,
               COALESCE(NULLIF(TRIM(u.departamento), ''), NULLIF(TRIM(u.role), ''), 'general') AS departamento,
               u.email,
               COALESCE(vp.participa, TRUE) AS participa,
               CASE WHEN LOWER(COALESCE(u.role, '')) = 'admin' THEN TRUE ELSE COALESCE(vp.acceso_modulo, TRUE) END AS acceso_modulo,
               vp.notas,
               vp.updated_at
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             ORDER BY empleado_nombre ASC;`,
        );
        return rows;
    }

    static async getParticipantOpenCommitments(empleadoId) {
        const { rows } = await pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
               COUNT(*) FILTER (WHERE estado = 'aprobada' AND fecha_fin >= CURRENT_DATE)::int AS aprobadas_futuras
             FROM vacaciones_empleados
             WHERE empleado_id = $1
               AND (
                    estado = 'pendiente'
                    OR (estado = 'aprobada' AND fecha_fin >= CURRENT_DATE)
               );`,
            [empleadoId],
        );
        return {
            pendientes: Number(rows[0]?.pendientes || 0),
            aprobadas_futuras: Number(rows[0]?.aprobadas_futuras || 0),
        };
    }

    static async updateParticipant({ empleadoId, participa = null, accesoModulo = null, notas = null, updatedBy }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_participantes (empleado_id, participa, acceso_modulo, notas, updated_by, updated_at)
             VALUES ($1, COALESCE($2::boolean, TRUE), COALESCE($3::boolean, TRUE), $4, $5, NOW())
             ON CONFLICT (empleado_id) DO UPDATE SET
               participa = COALESCE($2::boolean, vacaciones_participantes.participa),
               acceso_modulo = COALESCE($3::boolean, vacaciones_participantes.acceso_modulo),
               notas = COALESCE($4, vacaciones_participantes.notas),
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()
             RETURNING *;`,
            [empleadoId, participa, accesoModulo, notas, updatedBy || null],
        );
        return rows[0] || null;
    }

    static async list({ requesterId, requesterRole, estado, departamento, month, year, empleado }) {
        const where = [];
        const params = [];
        const displayName = `COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''),
            NULLIF(TRIM(u.username), ''),
            NULLIF(TRIM(u.email), ''),
            v.empleado_nombre,
            'Empleado ' || v.empleado_id::text
        )`;

        if (!this.canManageVacaciones(requesterRole)) {
            params.push(requesterId);
            where.push(`v.empleado_id = $${params.length}`);
        }

        if (estado && ['pendiente', 'aprobada', 'rechazada', 'cancelada'].includes(estado)) {
            params.push(estado);
            where.push(`v.estado = $${params.length}`);
        }

        if (departamento) {
            params.push(`%${departamento}%`);
            where.push(`v.departamento ILIKE $${params.length}`);
        }

        if (empleado) {
            params.push(`%${empleado}%`);
            where.push(`${displayName} ILIKE $${params.length}`);
        }

        if (month && /^\d{4}-\d{2}$/.test(month)) {
            params.push(`${month}-01`);
            where.push(`date_trunc('month', v.fecha_inicio) = date_trunc('month', $${params.length}::date)`);
        } else if (year && /^\d{4}$/.test(String(year))) {
            params.push(Number(year));
            where.push(`EXTRACT(YEAR FROM v.fecha_inicio) = $${params.length}`);
        }

        const text = `
          SELECT v.*, ${displayName} AS empleado_nombre
          FROM vacaciones_empleados v
          LEFT JOIN usuarios u ON u.id = v.empleado_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY v.created_at DESC;
        `;

        const { rows } = await pool.query(text, params);
        return rows;
    }

    static async create({ input }) {
        const {
            empleado_id, empleado_nombre, departamento, empleado_role, fecha_inicio, fecha_fin,
            dias_solicitados, motivo, estado = 'pendiente', origen = 'empleado',
            revisado_por = null, excepcion_aprobada = false, excepcion_motivo = null, excepcion_por = null,
        } = input;

        const { rows } = await pool.query(
            `INSERT INTO vacaciones_empleados
       (empleado_id, empleado_nombre, departamento, empleado_role, fecha_inicio, fecha_fin, dias_solicitados, motivo,
        estado, origen, revisado_por, revisado_at, excepcion_aprobada, excepcion_motivo, excepcion_por, excepcion_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $11::int IS NULL THEN NULL ELSE NOW() END,$12,$13,$14,CASE WHEN $12::boolean THEN NOW() ELSE NULL END)
       RETURNING *;`,
            [empleado_id, empleado_nombre, departamento, empleado_role || null, fecha_inicio, fecha_fin, dias_solicitados,
             motivo || null, estado, origen, revisado_por, Boolean(excepcion_aprobada), excepcion_motivo || null, excepcion_por],
        );
        return rows[0];
    }

    static async getById(id) {
        const { rows } = await pool.query('SELECT * FROM vacaciones_empleados WHERE id = $1', [id]);
        return rows[0] || null;
    }

    static async getEmployeeProfile(empleadoId) {
        const { rows } = await pool.query(
            `SELECT u.id AS empleado_id,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'Empleado ' || u.id::text) AS empleado_nombre,
                    COALESCE(NULLIF(TRIM(u.departamento), ''), NULLIF(TRIM(u.role), ''), 'general') AS departamento,
                    COALESCE(NULLIF(TRIM(u.role), ''), 'user') AS role,
                    COALESCE(vp.participa, TRUE) AS participa
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE u.id = $1`,
            [empleadoId],
        );
        return rows[0] || null;
    }

    static async hasDateOverlap({ empleado_id, fecha_inicio, fecha_fin, excludeRequestId = null }) {
        const { rows } = await pool.query(
            `SELECT id FROM vacaciones_empleados
             WHERE empleado_id = $1
               AND estado IN ('pendiente', 'aprobada')
               AND fecha_inicio <= $3::date AND fecha_fin >= $2::date
               AND ($4::int IS NULL OR id <> $4::int)
             LIMIT 1;`,
            [empleado_id, fecha_inicio, fecha_fin, excludeRequestId],
        );
        return Boolean(rows[0]);
    }

    static async isBlockedWeek({ fecha_inicio, fecha_fin, departamento }) {
        const { rows } = await pool.query(
            `SELECT id, motivo, departamento
       FROM vacaciones_semanas_bloqueadas
       WHERE activa = TRUE
         AND fecha_inicio <= $2::date
         AND fecha_fin >= $1::date
         AND (departamento IS NULL OR departamento = '' OR LOWER(departamento) = LOWER($3))
       ORDER BY fecha_inicio ASC
       LIMIT 1;`,
            [fecha_inicio, fecha_fin, departamento || 'general'],
        );

        return rows[0] || null;
    }

    static async getYearAdjustments({ empleadoId, year }) {
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const { rows } = await pool.query(
            `SELECT COALESCE(SUM(${diasColumn}), 0) AS total
       FROM ${this.getAjustesTable()}
       WHERE empleado_id = $1
         AND ${yearColumn} = $2;`,
            [empleadoId, year],
        );

        return Number(rows[0]?.total || 0);
    }

    static async listAdjustments({ year, empleadoId }) {
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const params = [];
        const where = [];

        if (year) {
            params.push(Number(year));
            where.push(`a.${yearColumn} = $${params.length}`);
        }

        if (empleadoId) {
            params.push(Number(empleadoId));
            where.push(`a.empleado_id = $${params.length}`);
        }

        const { rows } = await pool.query(
            `SELECT a.*, a.${diasColumn} AS dias, a.${yearColumn} AS year, COALESCE(u.nombre, a.empleado_id::text) AS empleado_nombre
       FROM ${this.getAjustesTable()} a
       LEFT JOIN usuarios u ON u.id = a.empleado_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC;`,
            params,
        );

        return rows;
    }

    static async createAdjustment({ empleado_id, year, tipo, dias, motivo, created_by }) {
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const { rows } = await pool.query(
            `INSERT INTO ${this.getAjustesTable()} (empleado_id, ${yearColumn}, tipo, ${diasColumn}, motivo, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
            [empleado_id, year, tipo, dias, motivo || null, created_by || null],
        );

        return rows[0] || null;
    }

    static async getAdjustmentById(id) {
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const { rows } = await pool.query(
            `SELECT a.*, a.${diasColumn} AS dias, a.${yearColumn} AS year
             FROM ${this.getAjustesTable()} a
             WHERE a.id = $1`,
            [id],
        );
        return rows[0] || null;
    }

    static async deleteAdjustment(id) {
        // Nota: el patch original tenía comillas simples con template literal sin interpolar.
        // Aquí lo dejamos correcto para que funcione.
        const { rowCount } = await pool.query(`DELETE FROM ${this.getAjustesTable()} WHERE id = $1`, [id]);
        return rowCount > 0;
    }

    static async listNonWorkingDays({ year, activeOnly = false }) {
        const params = [];
        const where = [];

        if (year) {
            params.push(Number(year));
            where.push(`EXTRACT(YEAR FROM fecha) = $${params.length}`);
        }

        if (activeOnly) {
            where.push('activa = TRUE');
        }

        const { rows } = await pool.query(
            `SELECT *
       FROM vacaciones_no_laborables
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY fecha ASC;`,
            params,
        );

        return rows;
    }

    static async createNonWorkingDay({ fecha, descripcion, ambito }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_no_laborables (fecha, descripcion, ambito)
       VALUES ($1, $2, $3)
       ON CONFLICT (fecha)
       DO UPDATE SET descripcion = EXCLUDED.descripcion,
                     ambito = EXCLUDED.ambito,
                     activa = TRUE
       RETURNING *;`,
            [fecha, descripcion || null, ambito || 'Montilla, Córdoba, España'],
        );

        return rows[0] || null;
    }

    static async getNonWorkingDayById(id) {
        const { rows } = await pool.query('SELECT * FROM vacaciones_no_laborables WHERE id = $1', [id]);
        return rows[0] || null;
    }

    static async toggleNonWorkingDay({ id, activa }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_no_laborables
       SET activa = $2
       WHERE id = $1
       RETURNING *;`,
            [id, Boolean(activa)],
        );

        return rows[0] || null;
    }

    static async deleteNonWorkingDay(id) {
        const { rowCount } = await pool.query('DELETE FROM vacaciones_no_laborables WHERE id = $1', [id]);
        return rowCount > 0;
    }

    static async listBlockedWeeks({ departamento, activeOnly = false, year = null }) {
        const params = [];
        const where = [];

        if (year) {
            const targetYear = Number(year);
            params.push(`${targetYear}-01-01`);
            const fromParam = params.length;
            params.push(`${targetYear}-12-31`);
            const toParam = params.length;
            where.push(`fecha_fin >= $${fromParam}::date AND fecha_inicio <= $${toParam}::date`);
        }

        if (departamento) {
            params.push(`%${departamento}%`);
            where.push(`COALESCE(departamento, '') ILIKE $${params.length}`);
        }

        if (activeOnly) {
            where.push('activa = TRUE');
        }

        const { rows } = await pool.query(
            `SELECT *
       FROM vacaciones_semanas_bloqueadas
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY fecha_inicio ASC;`,
            params,
        );

        return rows;
    }

    static async createBlockedWeek({ departamento, fecha_inicio, fecha_fin, motivo }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_semanas_bloqueadas (departamento, fecha_inicio, fecha_fin, motivo)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
            [departamento || null, fecha_inicio, fecha_fin, motivo || null],
        );

        return rows[0] || null;
    }

    static async getBlockedWeekById(id) {
        const { rows } = await pool.query('SELECT * FROM vacaciones_semanas_bloqueadas WHERE id = $1', [id]);
        return rows[0] || null;
    }

    static async toggleBlockedWeek({ id, activa }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_semanas_bloqueadas
       SET activa = $2
       WHERE id = $1
       RETURNING *;`,
            [id, Boolean(activa)],
        );

        return rows[0] || null;
    }

    static async deleteBlockedWeek(id) {
        const { rowCount } = await pool.query('DELETE FROM vacaciones_semanas_bloqueadas WHERE id = $1', [id]);
        return rowCount > 0;
    }

    static async getMandatoryVacationDayCount({ year, fechasMMDD = [] }) {
        const targetYear = Number(year) || new Date().getFullYear();
        const dateValues = [...new Set((Array.isArray(fechasMMDD) ? fechasMMDD : [])
            .map((value) => String(value || '').trim())
            .filter((value) => isValidMmDdForYear(value, targetYear)))]
            .map((value) => `${targetYear}-${value}`);

        if (dateValues.length === 0) return 0;

        const { rows } = await pool.query(
            `WITH obligatorios AS (
               SELECT fecha
               FROM unnest($1::date[]) AS t(fecha)
             )
             SELECT COUNT(*)::int AS total
             FROM obligatorios o
             WHERE EXTRACT(ISODOW FROM o.fecha) < 6
               AND NOT EXISTS (
                 SELECT 1
                 FROM vacaciones_no_laborables nl
                 WHERE nl.activa = TRUE
                   AND nl.fecha = o.fecha
               );`,
            [dateValues],
        );

        return Number(rows[0]?.total || 0);
    }

    static async getYearConsumption({ empleadoId, year, excludeRequestId = null }) {
        const { rows } = await pool.query(
            `SELECT
               COALESCE(SUM(dias_solicitados) FILTER (WHERE estado = 'aprobada'), 0) AS dias_aprobados,
               COALESCE(SUM(dias_solicitados) FILTER (WHERE estado = 'pendiente'), 0) AS dias_pendientes
             FROM vacaciones_empleados
             WHERE empleado_id = $1
               AND EXTRACT(YEAR FROM fecha_inicio) = $2
               AND ($3::int IS NULL OR id <> $3::int);`,
            [empleadoId, year, excludeRequestId],
        );
        return rows[0] || { dias_aprobados: 0, dias_pendientes: 0 };
    }

    static async getYearConsumptionSplit({ empleadoId, year, limiteFecha, excludeRequestId = null }) {
        const { rows } = await pool.query(
            `SELECT
               COALESCE(SUM(dias_solicitados) FILTER (WHERE estado IN ('pendiente','aprobada') AND fecha_fin <= $3::date), 0)::numeric AS dias_tempranos,
               COALESCE(SUM(dias_solicitados) FILTER (WHERE estado IN ('pendiente','aprobada') AND fecha_fin > $3::date), 0)::numeric AS dias_tardios
             FROM vacaciones_empleados
             WHERE empleado_id = $1 AND EXTRACT(YEAR FROM fecha_inicio) = $2
               AND ($4::int IS NULL OR id <> $4::int);`,
            [empleadoId, Number(year), limiteFecha, excludeRequestId],
        );
        return { dias_tempranos: Number(rows[0]?.dias_tempranos || 0), dias_tardios: Number(rows[0]?.dias_tardios || 0) };
    }

    static async getCarryoverForYear({ empleadoId, year }) {
        const { rows } = await pool.query(`SELECT * FROM vacaciones_arrastres WHERE empleado_id = $1 AND target_year = $2`, [empleadoId, Number(year)]);
        return rows[0] || null;
    }

    static async getCarryoverStats({ sourceYear = null, targetYear = null }) {
        const params = []; const where = [];
        if (sourceYear != null) { params.push(Number(sourceYear)); where.push(`source_year = $${params.length}`); }
        if (targetYear != null) { params.push(Number(targetYear)); where.push(`target_year = $${params.length}`); }
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS empleados, COALESCE(SUM(dias),0)::numeric AS dias
             FROM vacaciones_arrastres ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
            params,
        );
        return { empleados: Number(rows[0]?.empleados || 0), dias: Number(rows[0]?.dias || 0) };
    }

    static async generateCarryovers({ sourceYear, createdBy = null }) {
        const year = Number(sourceYear);
        const config = await this.getAnnualConfig(year);
        const maxDays = Number(config.arrastre_max_dias || 0);
        if (!config.arrastre_permitido || maxDays <= 0) return { created: 0, totalDias: 0, targetYear: year + 1 };

        const summaries = await this.getEmployeesSummary({ year });
        const targetYear = year + 1;
        const mmdd = /^\d{2}-\d{2}$/.test(String(config.arrastre_limite_mmdd || '')) ? String(config.arrastre_limite_mmdd) : '03-31';
        const limiteFecha = `${targetYear}-${mmdd}`;
        let created = 0; let totalDias = 0;
        for (const row of summaries) {
            const dias = Math.max(0, Math.min(Number(row.dias_disponibles || 0), maxDays));
            if (dias <= 0) continue;
            const result = await pool.query(
                `INSERT INTO vacaciones_arrastres (empleado_id, source_year, target_year, dias, limite_fecha, created_by, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,NOW())
                 ON CONFLICT (empleado_id, target_year) DO UPDATE SET
                   source_year = EXCLUDED.source_year, dias = EXCLUDED.dias, limite_fecha = EXCLUDED.limite_fecha,
                   created_by = EXCLUDED.created_by, updated_at = NOW()
                 RETURNING dias`,
                [row.empleado_id, year, targetYear, dias, limiteFecha, createdBy],
            );
            if (result.rows[0]) { created += 1; totalDias += Number(result.rows[0].dias || 0); }
        }
        return { created, totalDias, targetYear, limiteFecha };
    }

    static async getDepartmentHeadcount(departamento) {
        const hasDepartment = await this.checkUserDepartmentColumn();

        if (!hasDepartment) {
            const { rows } = await pool.query(
                `SELECT COUNT(*)::int AS total
         FROM usuarios u
         LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
         WHERE u.role = $1
           AND COALESCE(vp.participa, TRUE) = TRUE`,
                [departamento],
            );
            return Number(rows[0]?.total || 0);
        }

        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
       FROM usuarios u
       LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
       WHERE LOWER(COALESCE(u.departamento, '')) = LOWER($1)
         AND COALESCE(vp.participa, TRUE) = TRUE`,
            [departamento],
        );

        return Number(rows[0]?.total || 0);
    }

    static async getDepartmentMaxSimultaneousVacations(departamento) {
        const headcount = await this.getDepartmentHeadcount(departamento);
        if (headcount <= 1) return 1;
        return Math.max(1, Math.floor(headcount * DEFAULT_DEPT_CAPACITY_RATIO));
    }

    static async checkCapacity({ departamento, fecha_inicio, fecha_fin, maxSimultaneous, excludeRequestId = null }) {
        const { rows } = await pool.query(
            `WITH dias AS (
         SELECT d::date AS dia
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(ISODOW FROM d) < 6
       ),
       ocupacion AS (
         SELECT d.dia, COUNT(v.id)::int AS personas
         FROM dias d
         LEFT JOIN vacaciones_empleados v
           ON v.fecha_inicio <= d.dia
          AND v.fecha_fin >= d.dia
          AND v.estado IN ('pendiente', 'aprobada')
          AND LOWER(v.departamento) = LOWER($3)
          AND ($4::int IS NULL OR v.id <> $4::int)
         GROUP BY d.dia
       )
       SELECT COALESCE(MAX(personas), 0)::int AS max_ocupacion
       FROM ocupacion;`,
            [fecha_inicio, fecha_fin, departamento, excludeRequestId],
        );

        const currentMax = Number(rows[0]?.max_ocupacion || 0);
        return {
            currentMax,
            projectedMax: currentMax + 1,
            exceeded: currentMax + 1 > maxSimultaneous,
        };
    }

    static async updateStatus({ id, estado, comentario_rrhh, revisado_por = null, excepcion_aprobada = false, excepcion_motivo = null, excepcion_por = null }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_empleados
             SET estado=$2, comentario_rrhh=$3, revisado_por=$4, revisado_at=NOW(),
                 excepcion_aprobada=$5,
                 excepcion_motivo=CASE WHEN $5 THEN $6 ELSE excepcion_motivo END,
                 excepcion_por=CASE WHEN $5 THEN $7 ELSE excepcion_por END,
                 excepcion_at=CASE WHEN $5 THEN NOW() ELSE excepcion_at END,
                 updated_at=NOW()
             WHERE id=$1 RETURNING *;`,
            [id, estado, comentario_rrhh || null, revisado_por, Boolean(excepcion_aprobada), excepcion_motivo || null, excepcion_por],
        );
        return rows[0] || null;
    }

    static async updateApprovedRequestDates({ id, fecha_inicio, fecha_fin, dias_solicitados, comentario_rrhh = null, revisado_por = null, excepcion_aprobada = false, excepcion_motivo = null, excepcion_por = null }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_empleados SET fecha_inicio=$2, fecha_fin=$3, dias_solicitados=$4,
               comentario_rrhh=COALESCE($5, comentario_rrhh), revisado_por=$6, revisado_at=NOW(),
               excepcion_aprobada=$7,
               excepcion_motivo=CASE WHEN $7 THEN $8 ELSE excepcion_motivo END,
               excepcion_por=CASE WHEN $7 THEN $9 ELSE excepcion_por END,
               excepcion_at=CASE WHEN $7 THEN NOW() ELSE excepcion_at END,
               updated_at=NOW()
             WHERE id=$1 AND estado='aprobada' RETURNING *;`,
            [id, fecha_inicio, fecha_fin, dias_solicitados, comentario_rrhh, revisado_por, Boolean(excepcion_aprobada), excepcion_motivo, excepcion_por],
        );
        return rows[0] || null;
    }

    static async cancelByEmployee({ id, empleadoId }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_empleados
       SET estado = 'cancelada',
           updated_at = NOW()
       WHERE id = $1
         AND empleado_id = $2
         AND estado = 'pendiente'
       RETURNING *;`,
            [id, empleadoId],
        );

        return rows[0] || null;
    }

    static async createChangeRequest({ solicitudId, empleadoId, tipo, fechaInicioNueva = null, fechaFinNueva = null, diasNuevos = null, motivo = null }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_cambios_solicitados
               (solicitud_id, empleado_id, tipo, fecha_inicio_nueva, fecha_fin_nueva, dias_nuevos, motivo)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
            [solicitudId, empleadoId, tipo, fechaInicioNueva, fechaFinNueva, diasNuevos, motivo || null],
        );
        return rows[0] || null;
    }

    static async getChangeRequestById(id) {
        const { rows } = await pool.query(
            `SELECT c.*, v.fecha_inicio AS fecha_inicio_actual, v.fecha_fin AS fecha_fin_actual,
                    v.estado AS solicitud_estado, v.departamento, v.empleado_role, v.empleado_nombre
             FROM vacaciones_cambios_solicitados c JOIN vacaciones_empleados v ON v.id=c.solicitud_id
             WHERE c.id=$1`,
            [id],
        );
        return rows[0] || null;
    }

    static async listChangeRequests({ requesterId, requesterRole, year = null, estado = null }) {
        const params=[]; const where=[];
        if (!this.canManageVacaciones(requesterRole)) { params.push(Number(requesterId)); where.push(`c.empleado_id=$${params.length}`); }
        if (year) { params.push(Number(year)); where.push(`EXTRACT(YEAR FROM v.fecha_inicio)=$${params.length}`); }
        if (estado && ['pendiente','aprobada','rechazada','cancelada'].includes(estado)) { params.push(estado); where.push(`c.estado=$${params.length}`); }
        const { rows } = await pool.query(
            `SELECT c.*, v.fecha_inicio AS fecha_inicio_actual, v.fecha_fin AS fecha_fin_actual,
                    v.dias_solicitados AS dias_actuales, v.estado AS solicitud_estado,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''), v.empleado_nombre) AS empleado_nombre,
                    v.departamento, v.empleado_role
             FROM vacaciones_cambios_solicitados c
             JOIN vacaciones_empleados v ON v.id=c.solicitud_id
             LEFT JOIN usuarios u ON u.id=c.empleado_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY CASE WHEN c.estado='pendiente' THEN 0 ELSE 1 END, c.created_at DESC`,
            params,
        );
        return rows;
    }

    static async resolveChangeRequest({ id, estado, comentarioRrhh = null, resueltoPor = null }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_cambios_solicitados SET estado=$2, comentario_rrhh=$3,
               resuelto_por=$4, resuelto_at=NOW(), updated_at=NOW()
             WHERE id=$1 AND estado='pendiente' RETURNING *;`,
            [id, estado, comentarioRrhh || null, resueltoPor],
        );
        return rows[0] || null;
    }

    static async getEmployeesSummary({ year }) {
        const targetYear = Number(year) || new Date().getFullYear();
        const annualConfig = await this.getAnnualConfig(targetYear);
        const defaultAllowance = Number(annualConfig.dias_base_default || DEFAULT_DIAS_ANUALES);

        // Una vez abierto el ejercicio, todo empleado existente queda con su cupo base congelado.
        // Los usuarios nuevos se incorporan automáticamente la próxima vez que se consulte el ejercicio.
        if (annualConfig.permitir_solicitudes) {
            await this.snapshotAnnualAllowances({ year: targetYear, fallbackAllowance: defaultAllowance });
        }

        const mandatoryDays = await this.getMandatoryVacationDayCount({
            year: targetYear,
            fechasMMDD: annualConfig.fechas_obligatorias,
        });
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const hasAllowanceColumn = await this.checkUserAllowanceColumn();
        const liveAllowanceExpression = hasAllowanceColumn
            ? `COALESCE(u.dias_vacaciones_anuales, ${defaultAllowance})`
            : `${defaultAllowance}`;

        const { rows } = await pool.query(
            `WITH usuarios_base AS (
                SELECT
                    u.id AS empleado_id,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'Empleado ' || u.id::text) AS empleado_nombre,
                    COALESCE(NULLIF(TRIM(u.departamento), ''), NULLIF(TRIM(u.role), ''), 'general') AS departamento,
                    COALESCE(NULLIF(TRIM(u.role), ''), 'user') AS role,
                    COALESCE(ca.dias_base, ${liveAllowanceExpression})::numeric AS allowance,
                    (ca.empleado_id IS NOT NULL) AS cupo_congelado,
                    ca.fuente AS cupo_fuente,
                    ca.created_at AS cupo_congelado_at
                FROM usuarios u
                LEFT JOIN vacaciones_cupos_anuales ca
                  ON ca.empleado_id = u.id
                 AND ca.year = $1
                LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
                WHERE (
                    COALESCE(vp.participa, TRUE) = TRUE
                    OR (
                        $2::boolean = TRUE
                        AND (
                            ca.empleado_id IS NOT NULL
                            OR EXISTS (
                                SELECT 1
                                FROM vacaciones_empleados vh
                                WHERE vh.empleado_id = u.id
                                  AND EXTRACT(YEAR FROM vh.fecha_inicio) = $1
                            )
                        )
                    )
                )
            ),
            vacaciones_agg AS (
                SELECT
                    v.empleado_id,
                    COUNT(*)::int AS total_solicitudes,
                    COALESCE(SUM(v.dias_solicitados) FILTER (WHERE v.estado = 'aprobada'), 0)::int AS dias_aprobados,
                    COALESCE(SUM(v.dias_solicitados) FILTER (WHERE v.estado = 'pendiente'), 0)::int AS dias_pendientes,
                    COALESCE(SUM(v.dias_solicitados) FILTER (WHERE v.estado = 'rechazada'), 0)::int AS dias_rechazados,
                    COALESCE(SUM(v.dias_solicitados) FILTER (WHERE v.estado = 'cancelada'), 0)::int AS dias_cancelados
                FROM vacaciones_empleados v
                WHERE EXTRACT(YEAR FROM v.fecha_inicio) = $1
                GROUP BY v.empleado_id
            ),
            ajustes_agg AS (
                SELECT
                    a.empleado_id,
                    COALESCE(SUM(a.${diasColumn}), 0)::numeric AS dias_ajuste
                FROM ${this.getAjustesTable()} a
                WHERE a.${yearColumn} = $1
                GROUP BY a.empleado_id
            )
            SELECT
                ub.empleado_id,
                ub.empleado_nombre,
                ub.departamento,
                ub.role,
                ub.allowance,
                ub.cupo_congelado,
                ub.cupo_fuente,
                ub.cupo_congelado_at,
                COALESCE(va.total_solicitudes, 0) AS total_solicitudes,
                COALESCE(va.dias_aprobados, 0) AS dias_aprobados,
                COALESCE(va.dias_pendientes, 0) AS dias_pendientes,
                COALESCE(va.dias_rechazados, 0) AS dias_rechazados,
                COALESCE(va.dias_cancelados, 0) AS dias_cancelados,
                COALESCE(aa.dias_ajuste, 0) AS dias_ajuste,
                GREATEST(
                    ub.allowance + COALESCE(aa.dias_ajuste, 0) - ${mandatoryDays}
                    - COALESCE(va.dias_aprobados, 0)
                    - COALESCE(va.dias_pendientes, 0),
                    0
                ) AS dias_disponibles
            FROM usuarios_base ub
            LEFT JOIN vacaciones_agg va ON va.empleado_id = ub.empleado_id
            LEFT JOIN ajustes_agg aa ON aa.empleado_id = ub.empleado_id
            ORDER BY ub.empleado_nombre ASC;`,
            [targetYear, Boolean(annualConfig.cerrado)],
        );

        const today = new Date();
        for (const row of rows) {
            const carry = await this.getCarryoverForYear({ empleadoId: row.empleado_id, year: targetYear });
            if (!carry) {
                row.dias_arrastre = 0;
                row.dias_arrastre_disponibles = 0;
                row.arrastre_limite_fecha = null;
                continue;
            }

            const split = await this.getYearConsumptionSplit({
                empleadoId: row.empleado_id,
                year: targetYear,
                limiteFecha: carry.limite_fecha,
            });
            const carryTotal = Number(carry.dias || 0);
            const earlyConsumed = Number(split.dias_tempranos || 0);
            const lateConsumed = Number(split.dias_tardios || 0);
            const baseSelectable = Math.max(Number(row.allowance || 0) + Number(row.dias_ajuste || 0) - mandatoryDays, 0);
            const baseUsedEarly = Math.max(earlyConsumed - carryTotal, 0);
            const baseRemaining = Math.max(baseSelectable - baseUsedEarly - lateConsumed, 0);
            const limitDate = new Date(`${String(carry.limite_fecha).slice(0, 10)}T23:59:59`);
            const carryRemaining = today <= limitDate ? Math.max(carryTotal - earlyConsumed, 0) : 0;

            row.dias_arrastre = carryTotal;
            row.dias_arrastre_disponibles = carryRemaining;
            row.arrastre_limite_fecha = carry.limite_fecha;
            row.dias_disponibles = baseRemaining + carryRemaining;
        }

        return rows;
    }

    static async getEmployeeTimeline({ empleadoId, year }) {
        const params = [empleadoId];
        let where = 'WHERE empleado_id = $1';

        if (year) {
            params.push(Number(year));
            where += ` AND EXTRACT(YEAR FROM fecha_inicio) = $${params.length}`;
        }

        const { rows } = await pool.query(
            `SELECT *
       FROM vacaciones_empleados
       ${where}
       ORDER BY fecha_inicio DESC, created_at DESC;`,
            params,
        );

        return rows;
    }

    static async getStats({ requesterId, requesterRole, year }) {
        const params = [];
        let where = '';

        const filters = [];
        if (!this.canManageVacaciones(requesterRole)) {
            params.push(requesterId);
            filters.push(`empleado_id = $${params.length}`);
        }
        if (year && /^\d{4}$/.test(String(year))) {
            params.push(Number(year));
            filters.push(`EXTRACT(YEAR FROM fecha_inicio) = $${params.length}`);
        }
        where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT
        COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'aprobada') AS aprobadas,
        COUNT(*) FILTER (WHERE estado = 'rechazada') AS rechazadas,
        COUNT(*) FILTER (WHERE estado = 'cancelada') AS canceladas,
        COALESCE(SUM(dias_solicitados) FILTER (WHERE estado = 'aprobada'), 0) AS dias_aprobados
      FROM vacaciones_empleados
      ${where};`,
            params,
        );

        return rows[0];
    }

    static async listCapacityRules({ activeOnly = false } = {}) {
        const { rows } = await pool.query(
            `SELECT *
             FROM vacaciones_reglas_cupo
             ${activeOnly ? 'WHERE activa = TRUE' : ''}
             ORDER BY tipo ASC, valor ASC;`,
        );
        return rows;
    }

    static async createCapacityRule({ tipo, valor, max_personas, descripcion }) {
        const normalizedValue = valor.trim();
        const params = [tipo, normalizedValue, Number(max_personas), descripcion || null];

        const updated = await pool.query(
            `UPDATE vacaciones_reglas_cupo
             SET valor = $2,
                 max_personas = $3,
                 descripcion = $4,
                 activa = TRUE,
                 updated_at = NOW()
             WHERE tipo = $1 AND LOWER(valor) = LOWER($2)
             RETURNING *;`,
            params,
        );

        if (updated.rows[0]) return updated.rows[0];

        const { rows } = await pool.query(
            `INSERT INTO vacaciones_reglas_cupo (tipo, valor, max_personas, descripcion)
             VALUES ($1, $2, $3, $4)
             RETURNING *;`,
            params,
        );
        return rows[0] || null;
    }

    static async toggleCapacityRule({ id, activa }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_reglas_cupo
             SET activa = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING *;`,
            [id, Boolean(activa)],
        );
        return rows[0] || null;
    }

    static async deleteCapacityRule(id) {
        const { rowCount } = await pool.query('DELETE FROM vacaciones_reglas_cupo WHERE id = $1', [id]);
        return rowCount > 0;
    }

    static async getApplicableCapacityRules({ departamento, role }) {
        const values = [departamento || '', role || ''];
        const { rows } = await pool.query(
            `SELECT *
             FROM vacaciones_reglas_cupo
             WHERE activa = TRUE
               AND ((tipo = 'departamento' AND LOWER(valor) = LOWER($1))
                 OR (tipo = 'rol' AND LOWER(valor) = LOWER($2)))
             ORDER BY CASE WHEN tipo = 'rol' THEN 0 ELSE 1 END, id ASC;`,
            values,
        );
        return rows;
    }

    static async checkRuleCapacity({ tipo, valor, fecha_inicio, fecha_fin, maxSimultaneous, excludeRequestId = null }) {
        const columnCondition = tipo === 'rol'
            ? `LOWER(COALESCE(v.empleado_role, u.role, '')) = LOWER($3)`
            : `LOWER(COALESCE(v.departamento, u.departamento, u.role, '')) = LOWER($3)`;

        const { rows } = await pool.query(
            `WITH dias AS (
               SELECT d::date AS dia
               FROM generate_series($1::date, $2::date, interval '1 day') d
               WHERE EXTRACT(ISODOW FROM d) < 6
             )
             SELECT COALESCE(MAX((
               SELECT COUNT(*)::int
               FROM vacaciones_empleados v
               LEFT JOIN usuarios u ON u.id = v.empleado_id
               WHERE v.estado IN ('pendiente', 'aprobada')
                 AND v.fecha_inicio <= d.dia
                 AND v.fecha_fin >= d.dia
                 AND ${columnCondition}
                 AND ($4::int IS NULL OR v.id <> $4::int)
             )), 0)::int AS max_ocupacion
             FROM dias d;`,
            [fecha_inicio, fecha_fin, valor, excludeRequestId],
        );

        const currentMax = Number(rows[0]?.max_ocupacion || 0);
        return {
            currentMax,
            projectedMax: currentMax + 1,
            exceeded: currentMax + 1 > Number(maxSimultaneous),
        };
    }

    static async getAvailabilityCalendar({ requesterId, departamento, role, fecha_inicio, fecha_fin, mandatoryDates = [] }) {
        const rules = await this.getApplicableCapacityRules({ departamento, role });
        const departmentRule = rules.find((rule) => rule.tipo === 'departamento');
        const roleRule = rules.find((rule) => rule.tipo === 'rol');

        const fallbackDepartmentMax = !departamento || this.isCapacityExemptDepartment(departamento)
            ? null
            : await this.getDepartmentMaxSimultaneousVacations(departamento);

        const departmentMax = departmentRule ? Number(departmentRule.max_personas) : fallbackDepartmentMax;
        const roleMax = roleRule ? Number(roleRule.max_personas) : null;

        const { rows } = await pool.query(
            `WITH dias AS (
               SELECT d::date AS fecha
               FROM generate_series($1::date, $2::date, interval '1 day') d
             )
             SELECT
               d.fecha,
               EXTRACT(ISODOW FROM d.fecha)::int AS iso_dow,
               EXISTS (SELECT 1 FROM vacaciones_no_laborables nl WHERE nl.activa = TRUE AND nl.fecha = d.fecha) AS no_laborable,
               d.fecha = ANY($6::date[]) AS obligatorio_empresa,
               EXISTS (
                 SELECT 1 FROM vacaciones_semanas_bloqueadas bw
                 WHERE bw.activa = TRUE
                   AND bw.fecha_inicio <= d.fecha AND bw.fecha_fin >= d.fecha
                   AND (bw.departamento IS NULL OR bw.departamento = '' OR LOWER(bw.departamento) = LOWER($4))
               ) AS bloqueado,
               (SELECT COUNT(*)::int
                  FROM vacaciones_empleados v
                  LEFT JOIN usuarios u ON u.id = v.empleado_id
                 WHERE v.estado IN ('pendiente', 'aprobada')
                   AND v.fecha_inicio <= d.fecha AND v.fecha_fin >= d.fecha
                   AND LOWER(COALESCE(v.departamento, u.departamento, u.role, '')) = LOWER($4)) AS ocupacion_departamento,
               (SELECT COUNT(*)::int
                  FROM vacaciones_empleados v
                  LEFT JOIN usuarios u ON u.id = v.empleado_id
                 WHERE v.estado IN ('pendiente', 'aprobada')
                   AND v.fecha_inicio <= d.fecha AND v.fecha_fin >= d.fecha
                   AND LOWER(COALESCE(v.empleado_role, u.role, '')) = LOWER($5)) AS ocupacion_rol,
               EXISTS (
                 SELECT 1 FROM vacaciones_empleados own
                 WHERE own.empleado_id = $3
                   AND own.estado IN ('pendiente', 'aprobada')
                   AND own.fecha_inicio <= d.fecha AND own.fecha_fin >= d.fecha
               ) AS propia
             FROM dias d
             ORDER BY d.fecha ASC;`,
            [fecha_inicio, fecha_fin, requesterId, departamento || 'general', role || '', mandatoryDates],
        );

        return rows.map((row) => ({
            ...row,
            max_departamento: departmentMax,
            max_rol: roleMax,
            disponible: row.iso_dow < 6
                && !row.no_laborable
                && !row.obligatorio_empresa
                && !row.bloqueado
                && !row.propia
                && (departmentMax == null || Number(row.ocupacion_departamento) < departmentMax)
                && (roleMax == null || Number(row.ocupacion_rol) < roleMax),
        }));
    }


    static normalizeAnnualConfig(row, year) {
        const hasConfiguredDates = Array.isArray(row?.fechas_obligatorias);
        const rawDates = hasConfiguredDates ? row.fechas_obligatorias : DEFAULT_MANDATORY_MMDD;
        const fechas = [...new Set(rawDates
            .map((value) => String(value || '').trim())
            .filter((value) => isValidMmDdForYear(value, Number(row?.year || year))))];
        return {
            year: Number(row?.year || year),
            dias_base_default: Number(row?.dias_base_default ?? DEFAULT_DIAS_ANUALES),
            antelacion_minima_dias: Number(row?.antelacion_minima_dias ?? 21),
            max_dias_consecutivos: Number(row?.max_dias_consecutivos ?? 30),
            fechas_obligatorias: hasConfiguredDates ? fechas : [...DEFAULT_MANDATORY_MMDD],
            permitir_solicitudes: row?.permitir_solicitudes !== false && row?.cerrado !== true,
            cerrado: row?.cerrado === true,
            cerrado_at: row?.cerrado_at || null,
            cerrado_by: row?.cerrado_by || null,
            notas: row?.notas || '',
            arrastre_permitido: row?.arrastre_permitido === true,
            arrastre_max_dias: Number(row?.arrastre_max_dias || 0),
            arrastre_limite_mmdd: /^\d{2}-\d{2}$/.test(String(row?.arrastre_limite_mmdd || '')) ? String(row.arrastre_limite_mmdd) : '03-31',
            updated_by: row?.updated_by || null,
            updated_at: row?.updated_at || null,
        };
    }

    static async getAnnualConfig(year) {
        const targetYear = Number(year) || new Date().getFullYear();
        const openByDefault = targetYear <= new Date().getFullYear();
        await pool.query(
            `INSERT INTO vacaciones_configuracion_anual (year, permitir_solicitudes)
             VALUES ($1, $2)
             ON CONFLICT (year) DO NOTHING;`,
            [targetYear, openByDefault],
        );
        const { rows } = await pool.query(
            `SELECT * FROM vacaciones_configuracion_anual WHERE year = $1`,
            [targetYear],
        );
        return this.normalizeAnnualConfig(rows[0], targetYear);
    }

    static async updateAnnualConfig({ year, dias_base_default, antelacion_minima_dias, max_dias_consecutivos, fechas_obligatorias, permitir_solicitudes, notas, arrastre_permitido=false, arrastre_max_dias=0, arrastre_limite_mmdd='03-31', updated_by }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_configuracion_anual
               (year,dias_base_default,antelacion_minima_dias,max_dias_consecutivos,fechas_obligatorias,permitir_solicitudes,notas,
                arrastre_permitido,arrastre_max_dias,arrastre_limite_mmdd,updated_by,updated_at)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,NOW())
             ON CONFLICT (year) DO UPDATE SET
               dias_base_default=EXCLUDED.dias_base_default, antelacion_minima_dias=EXCLUDED.antelacion_minima_dias,
               max_dias_consecutivos=EXCLUDED.max_dias_consecutivos, fechas_obligatorias=EXCLUDED.fechas_obligatorias,
               permitir_solicitudes=EXCLUDED.permitir_solicitudes, notas=EXCLUDED.notas,
               arrastre_permitido=EXCLUDED.arrastre_permitido, arrastre_max_dias=EXCLUDED.arrastre_max_dias,
               arrastre_limite_mmdd=EXCLUDED.arrastre_limite_mmdd, updated_by=EXCLUDED.updated_by, updated_at=NOW()
             RETURNING *;`,
            [year,dias_base_default,antelacion_minima_dias,max_dias_consecutivos,JSON.stringify(fechas_obligatorias),Boolean(permitir_solicitudes),
             notas||null,Boolean(arrastre_permitido),Number(arrastre_max_dias||0),arrastre_limite_mmdd||'03-31',updated_by||null],
        );
        return this.normalizeAnnualConfig(rows[0], year);
    }


    static async getCapacityGroups() {
        const hasDepartment = await this.checkUserDepartmentColumn();
        const departmentExpr = hasDepartment ? "NULLIF(TRIM(u.departamento), '')" : 'NULL';
        const { rows } = await pool.query(
            `SELECT u.role, ${departmentExpr} AS departamento
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id = u.id
             WHERE COALESCE(vp.participa, TRUE) = TRUE
             ORDER BY u.role ASC;`,
        );
        const roles = [...new Set(rows.map((row) => String(row.role || '').trim()).filter(Boolean))];
        const departamentos = [...new Set(rows.map((row) => String(row.departamento || '').trim()).filter(Boolean))];
        return { roles, departamentos };
    }

    static async getYearReadiness(year) {
        const targetYear=Number(year);
        const config=await this.getAnnualConfig(targetYear);
        const participants=await this.listParticipants();
        const active=participants.filter(r=>r.participa!==false);
        const missingDepartment=active.filter(r=>!String(r.departamento||'').trim()).length;
        const missingRole=active.filter(r=>!String(r.role||'').trim()).length;
        const nonWorking=await this.listNonWorkingDays({year:targetYear,activeOnly:true});
        const rules=await this.listCapacityRules({activeOnly:true});
        const frozen=await this.getAnnualAllowanceSnapshotStats(targetYear);
        const checks=[
          {key:'participantes',label:'Hay empleados participantes',ok:active.length>0,critical:true,detail:`${active.length} participantes`},
          {key:'departamentos',label:'Todos los participantes tienen departamento',ok:missingDepartment===0,critical:true,detail:missingDepartment?`${missingDepartment} sin departamento`:'Correcto'},
          {key:'roles',label:'Todos los participantes tienen rol',ok:missingRole===0,critical:true,detail:missingRole?`${missingRole} sin rol`:'Correcto'},
          {key:'politica',label:'Política anual revisada',ok:Boolean(config.updated_by),critical:false,detail:config.updated_by?'Revisada':'Pendiente'},
          {key:'festivos',label:'Festivos/no laborables revisados',ok:nonWorking.length>0,critical:false,detail:`${nonWorking.length} configurados`},
          {key:'cupos',label:'Cobertura revisada',ok:rules.length>0,critical:false,detail:rules.length?`${rules.length} reglas activas`:'Se usarán cupos automáticos'},
        ];
        const blockers=checks.filter(x=>x.critical&&!x.ok);
        return {year:targetYear,score:Math.round(checks.filter(x=>x.ok).length/checks.length*100),can_open:blockers.length===0,blockers,checks,frozen_allowances:frozen,participants:active.length,closed:config.cerrado,open:config.permitir_solicitudes};
    }

    static async getDailyCoverage({ date }) {
        const { rows } = await pool.query(
            `SELECT u.id AS empleado_id,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ',NULLIF(TRIM(u.nombre),''),NULLIF(TRIM(u.apellido1),''),NULLIF(TRIM(u.apellido2),''))),''),NULLIF(TRIM(u.username),''),NULLIF(TRIM(u.email),''),'Empleado '||u.id::text) AS empleado_nombre,
                    COALESCE(NULLIF(TRIM(u.departamento),''),NULLIF(TRIM(u.role),''),'general') AS departamento,
                    COALESCE(NULLIF(TRIM(u.role),''),'user') AS role, v.id AS solicitud_id, v.estado
             FROM usuarios u
             LEFT JOIN vacaciones_participantes vp ON vp.empleado_id=u.id
             LEFT JOIN LATERAL (
               SELECT ve.id,ve.estado FROM vacaciones_empleados ve
               WHERE ve.empleado_id=u.id AND ve.estado IN ('pendiente','aprobada')
                 AND ve.fecha_inicio <= $1::date AND ve.fecha_fin >= $1::date
               ORDER BY CASE WHEN ve.estado='aprobada' THEN 0 ELSE 1 END, ve.id DESC LIMIT 1
             ) v ON TRUE
             WHERE COALESCE(vp.participa,TRUE)=TRUE
             ORDER BY departamento,role,empleado_nombre`,
            [date],
        );
        const group=(key)=>{
          const m=new Map();
          rows.forEach(r=>{const n=String(r[key]||'Sin asignar');const c=m.get(n)||{nombre:n,total:0,aprobadas:0,pendientes:0,disponibles:0};c.total++;if(r.estado==='aprobada')c.aprobadas++;else if(r.estado==='pendiente')c.pendientes++;else c.disponibles++;m.set(n,c);});
          return [...m.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
        };
        return {date,people:rows,departamentos:group('departamento'),roles:group('role'),approved:rows.filter(r=>r.estado==='aprobada'),pending:rows.filter(r=>r.estado==='pendiente')};
    }

    static async logAudit({ accion, entidadTipo, entidadId = null, empleadoId = null, actorId = null, actorNombre = null, actorRole = null, year = null, detalle = {} }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_auditoria
                (accion, entidad_tipo, entidad_id, empleado_id, actor_id, actor_nombre, actor_role, year, detalle)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
             RETURNING *;`,
            [accion, entidadTipo, entidadId, empleadoId, actorId, actorNombre || null, actorRole || null, year, JSON.stringify(detalle || {})],
        );
        return rows[0] || null;
    }

    static async listAudit({ year = null, empleadoId = null, limit = 150 }) {
        const params = [];
        const where = [];
        if (year) { params.push(Number(year)); where.push(`(a.year = $${params.length} OR a.year IS NULL)`); }
        if (empleadoId) { params.push(Number(empleadoId)); where.push(`a.empleado_id = $${params.length}`); }
        params.push(Math.min(Math.max(Number(limit) || 150, 1), 500));
        const { rows } = await pool.query(
            `SELECT a.*,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.apellido1), ''), NULLIF(TRIM(u.apellido2), ''))), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), a.actor_nombre) AS actor_display,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(emp.nombre), ''), NULLIF(TRIM(emp.apellido1), ''), NULLIF(TRIM(emp.apellido2), ''))), ''), NULLIF(TRIM(emp.username), ''), NULLIF(TRIM(emp.email), ''), 'Empleado ' || a.empleado_id::text) AS empleado_display
             FROM vacaciones_auditoria a
             LEFT JOIN usuarios u ON u.id = a.actor_id
             LEFT JOIN usuarios emp ON emp.id = a.empleado_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY a.created_at DESC
             LIMIT $${params.length};`,
            params,
        );
        return rows;
    }

    static async createNotification({ usuarioId, tipo = 'info', titulo, mensaje = null, solicitudId = null }) {
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_notificaciones (usuario_id, tipo, titulo, mensaje, solicitud_id)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING *;`,
            [usuarioId, tipo, titulo, mensaje || null, solicitudId || null],
        );
        return rows[0] || null;
    }

    static async createManagerNotifications({ tipo = 'info', titulo, mensaje = null, solicitudId = null, excludeUserId = null }) {
        const params = [tipo, titulo, mensaje || null, solicitudId || null];
        let excludeSql = '';
        if (excludeUserId) { params.push(Number(excludeUserId)); excludeSql = `AND u.id <> $${params.length}`; }
        const { rows } = await pool.query(
            `INSERT INTO vacaciones_notificaciones (usuario_id, tipo, titulo, mensaje, solicitud_id)
             SELECT u.id, $1, $2, $3, $4
             FROM usuarios u
             WHERE LOWER(COALESCE(u.role, '')) IN ('admin', 'rrhh')
               ${excludeSql}
             RETURNING *;`,
            params,
        );
        return rows;
    }

    static async listNotifications({ userId, unreadOnly = false, limit = 30 }) {
        const params = [userId];
        params.push(Math.min(Math.max(Number(limit) || 30, 1), 100));
        const { rows } = await pool.query(
            `SELECT n.*,
                    CASE WHEN v.fecha_inicio IS NOT NULL THEN EXTRACT(YEAR FROM v.fecha_inicio)::int ELSE NULL END AS solicitud_year
             FROM vacaciones_notificaciones n
             LEFT JOIN vacaciones_empleados v ON v.id = n.solicitud_id
             WHERE n.usuario_id = $1 ${unreadOnly ? 'AND n.leida = FALSE' : ''}
             ORDER BY n.created_at DESC
             LIMIT $2;`,
            params,
        );
        return rows;
    }

    static async markNotificationRead({ id, userId }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_notificaciones
             SET leida = TRUE
             WHERE id = $1 AND usuario_id = $2
             RETURNING *;`,
            [id, userId],
        );
        return rows[0] || null;
    }

    static async markAllNotificationsRead(userId) {
        const { rowCount } = await pool.query(
            `UPDATE vacaciones_notificaciones SET leida = TRUE WHERE usuario_id = $1 AND leida = FALSE`,
            [userId],
        );
        return rowCount || 0;
    }

    static async getYearPendingCount(year) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM vacaciones_empleados
             WHERE EXTRACT(YEAR FROM fecha_inicio) = $1 AND estado = 'pendiente'`,
            [Number(year)],
        );
        return Number(rows[0]?.total || 0);
    }

    static async getYearPendingChangeCount(year) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM vacaciones_cambios_solicitados c
             JOIN vacaciones_empleados v ON v.id = c.solicitud_id
             WHERE EXTRACT(YEAR FROM v.fecha_inicio) = $1
               AND c.estado = 'pendiente'`,
            [Number(year)],
        );
        return Number(rows[0]?.total || 0);
    }

    static async closeYear({ year, closedBy }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_configuracion_anual
             SET permitir_solicitudes = FALSE, cerrado = TRUE, cerrado_at = NOW(), cerrado_by = $2, updated_at = NOW()
             WHERE year = $1
             RETURNING *;`,
            [Number(year), closedBy || null],
        );
        return rows[0] ? this.normalizeAnnualConfig(rows[0], year) : null;
    }

    static async reopenYear({ year, updatedBy }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_configuracion_anual
             SET permitir_solicitudes = FALSE, cerrado = FALSE, cerrado_at = NULL, cerrado_by = NULL, updated_by = $2, updated_at = NOW()
             WHERE year = $1
             RETURNING *;`,
            [Number(year), updatedBy || null],
        );
        return rows[0] ? this.normalizeAnnualConfig(rows[0], year) : null;
    }

}
