import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const normalizeTextOrNull = (value) => {
    if (value === undefined || value === null) return null;

    const normalizedValue = String(value).trim();
    return normalizedValue || null;
};

const normalizeIntegerOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;

    const parsedValue = Number(value);
    return Number.isNaN(parsedValue) ? null : parsedValue;
};

const normalizeCodrepres = (codrepres) => {
    if (Array.isArray(codrepres)) {
        return [...new Set(
            codrepres
                .map((codrepre) => String(codrepre).trim())
                .filter(Boolean)
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

const normalizeUserData = (data) => {
    const normalizedData = { ...data };

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'username')) {
        normalizedData.username = normalizeTextOrNull(normalizedData.username);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'email')) {
        normalizedData.email = normalizeTextOrNull(normalizedData.email);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'nombre')) {
        normalizedData.nombre = normalizeTextOrNull(normalizedData.nombre);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'apellido1')) {
        normalizedData.apellido1 = normalizeTextOrNull(normalizedData.apellido1);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'apellido2')) {
        normalizedData.apellido2 = normalizeTextOrNull(normalizedData.apellido2);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'dni')) {
        normalizedData.dni = normalizeTextOrNull(normalizedData.dni);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'role')) {
        normalizedData.role = normalizeTextOrNull(normalizedData.role) || 'user';
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'tipo_jornada')) {
        normalizedData.tipo_jornada = normalizeTextOrNull(normalizedData.tipo_jornada) || 'intensiva';
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'departamento')) {
        normalizedData.departamento = normalizeTextOrNull(normalizedData.departamento);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'codrepre')) {
        normalizedData.codrepre = normalizeTextOrNull(normalizedData.codrepre);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'codrepres')) {
        normalizedData.codrepres = normalizeCodrepres(normalizedData.codrepres);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedData, 'dias_vacaciones_anuales')) {
        normalizedData.dias_vacaciones_anuales = normalizeIntegerOrNull(normalizedData.dias_vacaciones_anuales);
    }

    return normalizedData;
};

const handleDuplicateUserError = (error) => {
    if (error?.code !== '23505') {
        return null;
    }

    const constraint = String(error.constraint || '').toLowerCase();

    const duplicateField = constraint.includes('email')
        ? 'email'
        : 'username';

    const conflictError = new Error(`Ya existe un usuario con ese ${duplicateField}`);
    conflictError.code = 'DUPLICATE_USER';

    return conflictError;
};

export class UserModel {
    static async findByUsername(username) {
        const query = 'SELECT * FROM usuarios WHERE username = $1';
        const values = [username];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching user by username:', error);
            throw new Error('Error fetching user by username');
        }
    }

    static async findById(userId) {
        const query = 'SELECT * FROM usuarios WHERE id = $1';
        const values = [userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching user by ID:', error);
            throw new Error('Error fetching user by ID');
        }
    }

    static async updateJornada(userId, tipoJornada) {
        const query = `
            UPDATE usuarios
            SET tipo_jornada = $1,
                updated_at = now()
            WHERE id = $2
            RETURNING *
        `;

        const values = [tipoJornada, userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error updating user jornada:', error);
            throw new Error('Error updating user jornada');
        }
    }

    static async logAccess(userId, accessTime) {
        const query = 'INSERT INTO accesos (user_id, access_time) VALUES ($1, $2)';
        const values = [userId, accessTime];

        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error logging user access:', error);
            throw new Error('Error logging user access');
        }
    }

    static async setActiveSession(userId, isActive) {
        const query = `
            UPDATE usuarios
            SET active_session = $1,
                updated_at = now()
            WHERE id = $2
            RETURNING *
        `;

        const values = [isActive, userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error setting active session:', error);
            throw new Error('Error setting active session');
        }
    }

    static async setActiveSessionForAll(isActive) {
        const query = `
            UPDATE usuarios
            SET active_session = $1,
                updated_at = now()
            RETURNING *
        `;

        const values = [isActive];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows : [];
        } catch (error) {
            console.error('Error setting active session for all users:', error);
            throw new Error('Error setting active session for all users');
        }
    }

    static async getActiveSession(userId) {
        const query = 'SELECT active_session FROM usuarios WHERE id = $1';
        const values = [userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0].active_session : false;
        } catch (error) {
            console.error('Error getting active session:', error);
            throw new Error('Error getting active session');
        }
    }

    static async updateLastActivity(userId, lastActivityTime) {
        const query = `
            UPDATE usuarios
            SET last_activity = $1,
                updated_at = now()
            WHERE id = $2
            RETURNING *
        `;

        const values = [lastActivityTime, userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error updating last activity:', error);
            throw new Error('Error updating last activity');
        }
    }

    static async storeRefreshToken(userId, refreshToken) {
        const query = `
            UPDATE usuarios
            SET refresh_token = $1,
                updated_at = now()
            WHERE id = $2
        `;

        const values = [refreshToken, userId];

        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error storing refresh token:', error);
            throw new Error('Error storing refresh token');
        }
    }

    static async clearRefreshToken(userId) {
        const query = `
            UPDATE usuarios
            SET refresh_token = NULL,
                updated_at = now()
            WHERE id = $1
        `;

        const values = [userId];

        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error clearing refresh token:', error);
            throw new Error('Error clearing refresh token');
        }
    }

    static async getCommercialUsers() {
        const query = `
            SELECT
                id,
                username,
                nombre,
                apellido1,
                apellido2,
                email,
                codrepre,
                codrepres
            FROM usuarios
            WHERE role = $1
            ORDER BY username
        `;

        const values = ['comercial'];

        try {
            const { rows } = await pool.query(query, values);
            return rows;
        } catch (error) {
            console.error('Error fetching commercial users:', error);
            throw new Error('Error fetching commercial users');
        }
    }

    static async getDistinctRoles() {
        const result = await pool.query(`
            SELECT DISTINCT role
            FROM usuarios
            WHERE role IS NOT NULL AND TRIM(role) <> ''
            ORDER BY role
        `);

        return result.rows.map((row) => String(row.role).trim().toLowerCase());
    }

    static async getAllUsers() {
        const result = await pool.query(`
            SELECT
                id,
                username,
                role,
                nombre,
                apellido1,
                apellido2,
                dni,
                tipo_jornada,
                active_session,
                last_activity,
                email,
                imagenperfil,
                created_at,
                updated_at,
                last_login_at,
                dias_vacaciones_anuales,
                departamento,
                codrepre,
                codrepres
            FROM usuarios
            ORDER BY username
        `);

        return result.rows;
    }

    static async updateRole(userId, newRole) {
        const result = await pool.query(
            `
                UPDATE usuarios
                SET role = $1,
                    updated_at = now()
                WHERE id = $2
                RETURNING
                    id,
                    username,
                    role,
                    nombre,
                    apellido1,
                    apellido2,
                    dni,
                    tipo_jornada,
                    email,
                    imagenperfil,
                    dias_vacaciones_anuales,
                    departamento,
                    codrepre,
                    codrepres
            `,
            [newRole, userId]
        );

        return result.rows[0] || null;
    }

    static async createUser({
        username,
        password,
        role = 'user',
        nombre = null,
        apellido1 = null,
        apellido2 = null,
        dni = null,
        tipo_jornada = 'intensiva',
        email = null,
        imagenperfil = null,
        dias_vacaciones_anuales = null,
        departamento = null,
        codrepre = null,
        codrepres = [],
    }) {
        const normalizedData = normalizeUserData({
            username,
            role,
            nombre,
            apellido1,
            apellido2,
            dni,
            tipo_jornada,
            email,
            dias_vacaciones_anuales,
            departamento,
            codrepre,
            codrepres,
        });

        try {
            const result = await pool.query(
                `
                    INSERT INTO usuarios (
                        username,
                        password,
                        role,
                        nombre,
                        apellido1,
                        apellido2,
                        dni,
                        tipo_jornada,
                        email,
                        imagenperfil,
                        dias_vacaciones_anuales,
                        departamento,
                        codrepre,
                        codrepres,
                        password_changed_at,
                        updated_at
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9, $10, $11, $12, $13, $14,
                        now(), now()
                    )
                    RETURNING
                        id,
                        username,
                        role,
                        nombre,
                        apellido1,
                        apellido2,
                        dni,
                        tipo_jornada,
                        email,
                        imagenperfil,
                        created_at,
                        updated_at,
                        dias_vacaciones_anuales,
                        departamento,
                        codrepre,
                        codrepres
                `,
                [
                    normalizedData.username,
                    password,
                    normalizedData.role,
                    normalizedData.nombre,
                    normalizedData.apellido1,
                    normalizedData.apellido2,
                    normalizedData.dni,
                    normalizedData.tipo_jornada,
                    normalizedData.email,
                    imagenperfil,
                    normalizedData.dias_vacaciones_anuales,
                    normalizedData.departamento,
                    normalizedData.codrepre,
                    normalizedData.codrepres,
                ]
            );

            return result.rows[0];
        } catch (error) {
            const conflictError = handleDuplicateUserError(error);
            if (conflictError) throw conflictError;

            console.error('Error creating user:', error);
            throw error;
        }
    }

    static async deleteUser(id) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM accesos WHERE user_id = $1', [id]);

            const result = await client.query(
                'DELETE FROM usuarios WHERE id = $1 RETURNING id',
                [id]
            );

            await client.query('COMMIT');

            return result.rows[0] || null;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async updateUser(id, data) {
        const allowedFields = [
            'username',
            'role',
            'nombre',
            'apellido1',
            'apellido2',
            'dni',
            'tipo_jornada',
            'email',
            'imagenperfil',
            'dias_vacaciones_anuales',
            'departamento',
            'codrepre',
            'codrepres',
        ];

        const filteredData = Object.entries(data).reduce((acc, [key, value]) => {
            if (allowedFields.includes(key)) {
                acc[key] = value;
            }

            return acc;
        }, {});

        const normalizedData = normalizeUserData(filteredData);
        const keys = Object.keys(normalizedData);

        if (keys.length === 0) {
            return null;
        }

        const setClause = keys
            .map((key, index) => `"${key}" = $${index + 1}`)
            .join(', ');

        const values = Object.values(normalizedData);

        const query = `
            UPDATE usuarios
            SET ${setClause},
                updated_at = now()
            WHERE id = $${keys.length + 1}
            RETURNING
                id,
                username,
                role,
                nombre,
                apellido1,
                apellido2,
                dni,
                tipo_jornada,
                email,
                imagenperfil,
                created_at,
                updated_at,
                dias_vacaciones_anuales,
                departamento,
                codrepre,
                codrepres
        `;

        try {
            const result = await pool.query(query, [...values, id]);
            return result.rows[0] || null;
        } catch (error) {
            const conflictError = handleDuplicateUserError(error);
            if (conflictError) throw conflictError;

            console.error('Error updating user:', error);
            throw error;
        }
    }
}