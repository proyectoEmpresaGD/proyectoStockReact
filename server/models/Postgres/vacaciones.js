import pool from '../../db/pool.js';

const DEFAULT_DIAS_ANUALES = 30;
const DEFAULT_DEPT_CAPACITY_RATIO = 0.33;
let checkedUserAllowanceColumn = false;
let hasUserAllowanceColumn = false;
let checkedUserDepartmentColumn = false;
let hasUserDepartmentColumn = false;

export class VacacionesModel {
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

        if (requesterRole !== 'admin') {
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
        const {
            empleado_id,
            empleado_nombre,
            departamento,
            fecha_inicio,
            fecha_fin,
            dias_solicitados,
            motivo,
        } = input;

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

    static async getStats({ requesterId, requesterRole }) {
        const params = [];
        let where = '';

        if (requesterRole !== 'admin') {
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
