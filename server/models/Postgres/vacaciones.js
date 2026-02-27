import pool from '../../db/pool.js';

const DEFAULT_DIAS_ANUALES = 24;
const DEFAULT_DEPT_CAPACITY_RATIO = 0.33;
const DEFAULT_AJUSTES_TABLE = 'vacaciones_ajustes';
const EXEMPT_CAPACITY_DEPARTMENTS = ['ceo', 'compras', 'marketing', 'confección'];

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
        await pool.query(`
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
        comentario_rrhh TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

        await pool.query(`
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

        await pool.query(`
      CREATE TABLE IF NOT EXISTS vacaciones_no_laborables (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL UNIQUE,
        descripcion TEXT,
        ambito VARCHAR(120) DEFAULT 'Montilla, Córdoba, España',
        activa BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

        const ajustesTable = this.getAjustesTable();

        // ✅ Ajustes: estructura esperada (más flexible gracias a resolveAjustesColumns)
        await pool.query(`
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

        await pool.query(`
      ALTER TABLE ${ajustesTable}
      ADD CONSTRAINT ${ajustesTable}_empleado_fk
      FOREIGN KEY (empleado_id) REFERENCES usuarios(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
    `).catch(() => { });

        await pool.query(`
      ALTER TABLE ${ajustesTable}
      ADD CONSTRAINT ${ajustesTable}_created_by_fk
      FOREIGN KEY (created_by) REFERENCES usuarios(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
    `).catch(() => { });
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

    static async getUserAnnualAllowance(userId) {
        const hasColumn = await this.checkUserAllowanceColumn();
        if (!hasColumn) return DEFAULT_DIAS_ANUALES;

        const { rows } = await pool.query(
            'SELECT COALESCE(dias_vacaciones_anuales, $2) AS allowance FROM usuarios WHERE id = $1',
            [userId, DEFAULT_DIAS_ANUALES],
        );

        return Number(rows[0]?.allowance || DEFAULT_DIAS_ANUALES);
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

    static async list({ requesterId, requesterRole, estado, departamento, month, empleado }) {
        const where = [];
        const params = [];

        if (!this.canManageVacaciones(requesterRole)) {
            params.push(requesterId);
            where.push(`empleado_id = $${params.length}`);
        }

        if (estado && ['pendiente', 'aprobada', 'rechazada', 'cancelada'].includes(estado)) {
            params.push(estado);
            where.push(`estado = $${params.length}`);
        }

        if (departamento) {
            params.push(`%${departamento}%`);
            where.push(`departamento ILIKE $${params.length}`);
        }

        if (empleado) {
            params.push(`%${empleado}%`);
            where.push(`empleado_nombre ILIKE $${params.length}`);
        }

        if (month && /^\d{4}-\d{2}$/.test(month)) {
            params.push(`${month}-01`);
            where.push(`date_trunc('month', fecha_inicio) = date_trunc('month', $${params.length}::date)`);
        }

        const text = `
      SELECT *
      FROM vacaciones_empleados
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC;
    `;

        const { rows } = await pool.query(text, params);
        return rows;
    }

    static async create({ input }) {
        const { empleado_id, empleado_nombre, departamento, fecha_inicio, fecha_fin, dias_solicitados, motivo } = input;

        const { rows } = await pool.query(
            `INSERT INTO vacaciones_empleados
       (empleado_id, empleado_nombre, departamento, fecha_inicio, fecha_fin, dias_solicitados, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *;`,
            [empleado_id, empleado_nombre, departamento, fecha_inicio, fecha_fin, dias_solicitados, motivo || null],
        );

        return rows[0];
    }

    static async getById(id) {
        const { rows } = await pool.query('SELECT * FROM vacaciones_empleados WHERE id = $1', [id]);
        return rows[0] || null;
    }

    static async hasDateOverlap({ empleado_id, fecha_inicio, fecha_fin }) {
        const { rows } = await pool.query(
            `SELECT id
       FROM vacaciones_empleados
       WHERE empleado_id = $1
         AND estado IN ('pendiente', 'aprobada')
         AND fecha_inicio <= $3::date
         AND fecha_fin >= $2::date
       LIMIT 1;`,
            [empleado_id, fecha_inicio, fecha_fin],
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

    static async listBlockedWeeks({ departamento, activeOnly = false }) {
        const params = [];
        const where = [];

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

    static async getYearConsumption({ empleadoId, year }) {
        const { rows } = await pool.query(
            `SELECT
         COALESCE(SUM(dias_solicitados) FILTER (WHERE estado = 'aprobada'), 0) AS dias_aprobados,
         COALESCE(SUM(dias_solicitados) FILTER (WHERE estado = 'pendiente'), 0) AS dias_pendientes
       FROM vacaciones_empleados
       WHERE empleado_id = $1
         AND EXTRACT(YEAR FROM fecha_inicio) = $2;`,
            [empleadoId, year],
        );

        return rows[0] || { dias_aprobados: 0, dias_pendientes: 0 };
    }

    static async getDepartmentHeadcount(departamento) {
        const hasDepartment = await this.checkUserDepartmentColumn();

        if (!hasDepartment) {
            const { rows } = await pool.query(
                `SELECT COUNT(*)::int AS total
         FROM usuarios
         WHERE role = $1`,
                [departamento],
            );
            return Number(rows[0]?.total || 0);
        }

        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
       FROM usuarios
       WHERE LOWER(COALESCE(departamento, '')) = LOWER($1)`,
            [departamento],
        );

        return Number(rows[0]?.total || 0);
    }

    static async getDepartmentMaxSimultaneousVacations(departamento) {
        const headcount = await this.getDepartmentHeadcount(departamento);
        if (headcount <= 1) return 1;
        return Math.max(1, Math.floor(headcount * DEFAULT_DEPT_CAPACITY_RATIO));
    }

    static async checkCapacity({ departamento, fecha_inicio, fecha_fin, maxSimultaneous }) {
        const { rows } = await pool.query(
            `WITH dias AS (
         SELECT d::date AS dia
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(ISODOW FROM d) < 6
       ),
       ocupacion AS (
         SELECT d.dia, COUNT(*)::int AS personas
         FROM dias d
         LEFT JOIN vacaciones_empleados v
           ON v.fecha_inicio <= d.dia
          AND v.fecha_fin >= d.dia
          AND v.estado IN ('pendiente', 'aprobada')
          AND LOWER(v.departamento) = LOWER($3)
         GROUP BY d.dia
       )
       SELECT COALESCE(MAX(personas), 0)::int AS max_ocupacion
       FROM ocupacion;`,
            [fecha_inicio, fecha_fin, departamento],
        );

        const currentMax = Number(rows[0]?.max_ocupacion || 0);
        return {
            currentMax,
            projectedMax: currentMax + 1,
            exceeded: currentMax + 1 > maxSimultaneous,
        };
    }

    static async updateStatus({ id, estado, comentario_rrhh }) {
        const { rows } = await pool.query(
            `UPDATE vacaciones_empleados
       SET estado = $2,
           comentario_rrhh = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *;`,
            [id, estado, comentario_rrhh || null],
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

    static async getEmployeesSummary({ year }) {
        const { diasColumn, yearColumn } = await this.resolveAjustesColumns();
        const params = [];
        const hasYear = Boolean(year);

        if (hasYear) {
            params.push(Number(year));
        }

        const yearFilterVacaciones = hasYear ? `AND EXTRACT(YEAR FROM v.fecha_inicio) = $1` : '';
        const yearFilterAjustes = hasYear ? `AND a.${yearColumn} = $1` : '';

        const { rows } = await pool.query(
            `WITH usuarios_base AS (
                SELECT
                    u.id AS empleado_id,
                    COALESCE(NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'Empleado ' || u.id::text) AS empleado_nombre,
                    COALESCE(NULLIF(TRIM(u.departamento), ''), NULLIF(TRIM(u.role), ''), 'general') AS departamento
                FROM usuarios u
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
                WHERE 1=1
                ${yearFilterVacaciones}
                GROUP BY v.empleado_id
            ),
            ajustes_agg AS (
                SELECT
                    a.empleado_id,
                    COALESCE(SUM(a.${diasColumn}), 0)::numeric AS dias_ajuste
                FROM ${this.getAjustesTable()} a
                WHERE 1=1
                ${yearFilterAjustes}
                GROUP BY a.empleado_id
            )
            SELECT
                ub.empleado_id,
                ub.empleado_nombre,
                ub.departamento,
                COALESCE(va.total_solicitudes, 0) AS total_solicitudes,
                COALESCE(va.dias_aprobados, 0) AS dias_aprobados,
                COALESCE(va.dias_pendientes, 0) AS dias_pendientes,
                COALESCE(va.dias_rechazados, 0) AS dias_rechazados,
                COALESCE(va.dias_cancelados, 0) AS dias_cancelados,
                COALESCE(aa.dias_ajuste, 0) AS dias_ajuste
            FROM usuarios_base ub
            LEFT JOIN vacaciones_agg va ON va.empleado_id = ub.empleado_id
            LEFT JOIN ajustes_agg aa ON aa.empleado_id = ub.empleado_id
            ORDER BY ub.empleado_nombre ASC;`,
            params,
        );

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

    static async getStats({ requesterId, requesterRole }) {
        const params = [];
        let where = '';

        if (!this.canManageVacaciones(requesterRole)) {
            params.push(requesterId);
            where = `WHERE empleado_id = $1`;
        }

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
}