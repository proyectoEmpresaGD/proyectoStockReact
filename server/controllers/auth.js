import bcrypt from 'bcryptjs';
import moment from 'moment-timezone';
import { UserModel } from '../models/Postgres/usuarios.js';
import jwt from 'jsonwebtoken';
import { Client } from 'basic-ftp';
import path from 'path';
import { Readable } from 'stream';

async function withFtp(fn) {
    const client = new Client();

    await client.access({
        host: process.env.FTP_HOST,
        port: Number(process.env.FTP_PORT) || 21,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: process.env.FTP_SECURE === 'true',
    });

    try {
        return await fn(client);
    } finally {
        client.close();
    }
}

const SYSTEM_ROLES = [
    'admin',
    'comercial',
    'decoandyou',
    'almacen',
    'compras',
    'ventas',
    'user',
    'rrhh',
    'administracion',
    'administrativo',
];

const MAX_ROLE_LENGTH = Number(process.env.MAX_ROLE_LENGTH || 30);


const WAREHOUSE_ROLE_ROUTES = [
    '/etiquetas-lotes',
    '/',
    '/stock',
    '/equivalencias',
    '/fichaTecnica',
    '/etiquetas',
    '/reservasTejido',
    '/etiquetasMarke',
    '/estiquetaSinQR',
    '/EtiquetaPersonalizable',
    '/EtiquetaCameo',
    '/libro',
    '/libro19x4',
    '/libroNormativa',
    '/EtiquetasLibro35Tipo1',
    '/EtiquetasLibro35Tipo2',
    '/Libro35AnchoConImagen',
    '/Libro45AnchoConImagen',
    '/perchas',
    '/perchasEstampados',
    '/EtiquetaContraportada35',
    '/EtiquetaContraportada20',
    '/perfilusuario',
    '/fichar',
    '/rrhh/vacaciones',
];

const SYSTEM_ROLE_DEFINITIONS = {
    almacen: {
        name: 'almacen',
        permissions: ['stock.read', 'stock.write', 'labels.read'],
        routes: [...WAREHOUSE_ROLE_ROUTES],
    },
    compras: {
        name: 'compras',
        permissions: ['stock.read', 'stock.write', 'labels.read', 'purchasing.read'],
        routes: [...WAREHOUSE_ROLE_ROUTES, '/stock-alerts'],
    },
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

const buildImageProfileUrl = (user) => {
    if (!user?.imagenperfil) return null;

    return `${process.env.IMG_PROFILE_URL}/${user.id}/${encodeURIComponent(user.imagenperfil)}`;
};

function parseRoleDefinitionsFromEnv() {
    const raw = process.env.ROLE_DEFINITIONS_JSON;
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        return Object.entries(parsed).reduce((acc, [role, config]) => {
            const key = String(role || '').trim().toLowerCase();
            if (!key) return acc;

            const routes = Array.isArray(config?.routes)
                ? [...new Set(config.routes.map((route) => String(route || '').trim()).filter(Boolean))]
                : [];

            const permissions = Array.isArray(config?.permissions)
                ? [...new Set(config.permissions.map((permission) => String(permission || '').trim()).filter(Boolean))]
                : [];

            acc[key] = { name: key, routes, permissions };
            return acc;
        }, {});
    } catch (error) {
        console.error('ROLE_DEFINITIONS_JSON inválido:', error.message);
        return {};
    }
}

export class AuthController {
    static async login(req, res) {
        const { username, password } = req.body;

        try {
            const user = await UserModel.findByUsername(username);

            if (!user) {
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    codrepre: user.codrepre,
                    codrepres: user.codrepres || [],
                },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const refreshToken = jwt.sign(
                { id: user.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );

            await UserModel.storeRefreshToken(user.id, refreshToken);
            await UserModel.setActiveSession(user.id, true);

            return res.json({
                message: 'Login successful',
                token,
                refreshToken,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    nombre: user.nombre,
                    apellido1: user.apellido1,
                    apellido2: user.apellido2,
                    email: user.email,
                    tipo_jornada: user.tipo_jornada,
                    departamento: user.departamento,
                    codrepre: user.codrepre,
                    codrepres: user.codrepres || [],
                    imagenperfil: user.imagenperfil,
                    imagenperfil_url: buildImageProfileUrl(user),
                },
            });
        } catch (error) {
            console.error('Error during login:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async updateJornada(req, res) {
        const { userId, tipoJornada } = req.body;

        try {
            const updatedUser = await UserModel.updateJornada(userId, tipoJornada);

            if (!updatedUser) {
                return res.status(404).json({ message: 'User not found' });
            }

            return res.json({
                message: 'Jornada updated successfully',
                user: updatedUser,
            });
        } catch (error) {
            console.error('Error updating jornada:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async logout(req, res) {
        const { userId } = req.body;

        try {
            await UserModel.clearRefreshToken(userId);
            await UserModel.setActiveSession(userId, false);

            return res.json({ message: 'Logout successful' });
        } catch (error) {
            console.error('Error during logout:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async logoutAll(req, res) {
        try {
            await UserModel.setActiveSessionForAll(false);

            return res.json({ message: 'Logout all users successful' });
        } catch (error) {
            console.error('Error during logout all users:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async heartbeat(req, res) {
        const { userId } = req.body;

        try {
            const lastActivityTime = moment().tz('Europe/Madrid').format('YYYY-MM-DD HH:mm:ss');
            await UserModel.updateLastActivity(userId, lastActivityTime);

            return res.json({ message: 'Heartbeat successful' });
        } catch (error) {
            console.error('Error during heartbeat:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async refreshToken(req, res) {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(403).json({ message: 'Refresh token required' });
        }

        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await UserModel.findById(decoded.id);

            if (!user || user.refresh_token !== refreshToken) {
                return res.status(403).json({ message: 'Invalid refresh token' });
            }

            const newToken = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    codrepre: user.codrepre,
                    codrepres: user.codrepres || [],
                },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            return res.json({ token: newToken });
        } catch (error) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }
    }

    static async getCommercialUsers(req, res) {
        try {
            const commercialUsers = await UserModel.getCommercialUsers();
            return res.json(commercialUsers);
        } catch (error) {
            console.error('Error fetching commercial users:', error);
            return res.status(500).json({ message: 'Error fetching commercial users' });
        }
    }

    static async getPerfilUsuario(req, res) {
        try {
            const userId = req.user.id;
            const user = await UserModel.findById(userId);

            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            const { password, refresh_token, ...safeUser } = user;

            if (safeUser.imagenperfil) {
                safeUser.imagenperfil_url = buildImageProfileUrl(safeUser);
            }

            return res.json(safeUser);
        } catch (error) {
            console.error('Error al obtener el perfil del usuario:', error);
            return res.status(500).json({ message: 'Error al obtener perfil' });
        }
    }

    static async getRoleCatalog(req, res) {
        try {
            const dbRoles = await UserModel.getDistinctRoles();
            const envDefinitions = parseRoleDefinitionsFromEnv();

            const roleSet = new Set([
                ...SYSTEM_ROLES,
                ...dbRoles,
                ...Object.keys(SYSTEM_ROLE_DEFINITIONS),
                ...Object.keys(envDefinitions),
            ]);

            const roles = [...roleSet]
                .map((role) => String(role).trim().toLowerCase())
                .filter(Boolean)
                .filter((role) => role.length <= MAX_ROLE_LENGTH)
                .sort();

            return res.json({
                roles,
                definitions: {
                    ...SYSTEM_ROLE_DEFINITIONS,
                    ...envDefinitions,
                },
            });
        } catch (error) {
            console.error('Error obteniendo catálogo de roles:', error);
            return res.status(500).json({ message: 'Error interno al obtener roles' });
        }
    }

    static async getDepartments(req, res) {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({ message: 'No autorizado' });
            }

            if (typeof UserModel.getDepartments !== 'function') {
                return res.json([]);
            }

            const rows = await UserModel.getDepartments();
            return res.json(rows);
        } catch (err) {
            console.error('Error al obtener departamentos:', err);
            return res.status(500).json({ message: 'Error interno' });
        }
    }

    static async createDepartment(req, res) {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({ message: 'No autorizado' });
            }

            const nombre = String(req.body?.nombre || '').trim();

            if (!nombre) {
                return res.status(400).json({ message: 'Nombre de departamento requerido' });
            }

            if (typeof UserModel.createDepartment !== 'function') {
                return res.status(501).json({ message: 'Gestión de departamentos no implementada' });
            }

            const row = await UserModel.createDepartment(nombre);
            return res.status(201).json(row);
        } catch (err) {
            console.error('Error al crear departamento:', err);
            return res.status(500).json({ message: 'Error interno' });
        }
    }

    static async getAllUsers(req, res) {
        try {
            const users = await UserModel.getAllUsers();

            const usersWithImageUrls = users.map((user) => ({
                ...user,
                imagenperfil_url: buildImageProfileUrl(user),
            }));

            return res.json(usersWithImageUrls);
        } catch (err) {
            console.error('Error al obtener usuarios:', err);
            return res.status(500).json({ message: 'Error interno' });
        }
    }

    static async updateRole(req, res) {
        const { userId, newRole } = req.body;

        try {
            const result = await UserModel.updateRole(userId, newRole);

            if (!result) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            return res.json(result);
        } catch (err) {
            console.error('Error al actualizar rol:', err);
            return res.status(500).json({ message: 'Error interno' });
        }
    }

    static async createUserWithImage(req, res) {
        const {
            username,
            password,
            role = 'user',
            nombre,
            apellido1,
            apellido2,
            dni,
            tipo_jornada = 'intensiva',
            email,
            departamento,
            dias_vacaciones_anuales,
            codrepre,
            codrepres,
        } = req.body;

        const file = req.file;

        if (!username || !password || !role) {
            return res.status(400).json({
                message: 'Faltan datos obligatorios: username, password y role',
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            let imagenperfil = null;

            const newUser = await UserModel.createUser({
                username,
                password: hashedPassword,
                role,
                nombre,
                apellido1,
                apellido2,
                dni,
                tipo_jornada,
                email,
                departamento,
                dias_vacaciones_anuales,
                codrepre,
                codrepres: normalizeCodrepres(codrepres),
                imagenperfil: null,
            });

            if (file) {
                const userId = newUser.id;
                imagenperfil = file.originalname;

                const remoteDir = path.posix.join(
                    process.env.FTP_PROFILE_PATH,
                    userId.toString()
                );

                await withFtp(async (client) => {
                    await client.ensureDir(remoteDir);
                    await client.uploadFrom(
                        Readable.from(file.buffer),
                        path.posix.join(remoteDir, imagenperfil)
                    );
                });

                await UserModel.updateUser(userId, { imagenperfil });
            }

            const userWithImage = {
                ...newUser,
                imagenperfil,
                imagenperfil_url: imagenperfil
                    ? `${process.env.IMG_PROFILE_URL}/${newUser.id}/${encodeURIComponent(imagenperfil)}`
                    : null,
            };

            return res.status(201).json({
                message: 'Usuario creado correctamente',
                user: userWithImage,
            });
        } catch (err) {
            console.error('Error al crear usuario con imagen:', err);

            if (err.code === 'DUPLICATE_USER') {
                return res.status(409).json({ message: err.message });
            }

            return res.status(500).json({
                message: 'Error al crear usuario',
                error: err.message,
            });
        }
    }

    static async deleteUser(req, res) {
        const { id } = req.params;

        try {
            const deletedUser = await UserModel.deleteUser(id);

            if (!deletedUser) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            return res.json({ message: 'Usuario eliminado' });
        } catch (err) {
            console.error('Error al eliminar usuario:', err);

            if (err.code === '23503') {
                return res.status(409).json({
                    message: 'No se puede eliminar el usuario porque tiene registros relacionados en otras tablas',
                    constraint: err.constraint,
                    detail: err.detail,
                });
            }

            return res.status(500).json({ message: 'Error interno' });
        }
    }

    static async updateUser(req, res) {
        const { id } = req.params;
        const isAdmin = req.user?.role === 'admin';
        const isOwnProfile = String(req.user?.id) === String(id);

        if (!isAdmin && !isOwnProfile) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const {
            username,
            role,
            nombre,
            apellido1,
            apellido2,
            dni,
            tipo_jornada,
            email,
            departamento,
            dias_vacaciones_anuales,
            codrepre,
            codrepres,
        } = req.body;

        if (!isAdmin) {
            const restrictedFields = [
                'role',
                'dni',
                'tipo_jornada',
                'departamento',
                'dias_vacaciones_anuales',
                'codrepre',
                'codrepres',
            ];

            const triesToChangeRestrictedField = restrictedFields.some(
                (field) => req.body[field] !== undefined
            );

            if (triesToChangeRestrictedField) {
                return res.status(403).json({
                    message: 'No tienes permisos para modificar esos campos',
                });
            }
        }

        const dataToUpdate = {};

        if (username !== undefined) dataToUpdate.username = username;
        if (role !== undefined && isAdmin) dataToUpdate.role = role;
        if (nombre !== undefined) dataToUpdate.nombre = nombre;
        if (apellido1 !== undefined) dataToUpdate.apellido1 = apellido1;
        if (apellido2 !== undefined) dataToUpdate.apellido2 = apellido2;
        if (dni !== undefined) dataToUpdate.dni = dni;
        if (tipo_jornada !== undefined) dataToUpdate.tipo_jornada = tipo_jornada;
        if (email !== undefined) dataToUpdate.email = email;
        if (departamento !== undefined) dataToUpdate.departamento = departamento;
        if (dias_vacaciones_anuales !== undefined) {
            dataToUpdate.dias_vacaciones_anuales = dias_vacaciones_anuales;
        }
        if (codrepre !== undefined) dataToUpdate.codrepre = codrepre;
        if (codrepres !== undefined) dataToUpdate.codrepres = normalizeCodrepres(codrepres);

        if (Object.keys(dataToUpdate).length === 0) {
            return res.status(400).json({
                message: 'No se enviaron datos para actualizar',
            });
        }

        try {
            const updatedUser = await UserModel.updateUser(id, dataToUpdate);

            if (!updatedUser) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            return res.json({
                message: 'Usuario actualizado correctamente',
                user: {
                    ...updatedUser,
                    imagenperfil_url: buildImageProfileUrl(updatedUser),
                },
            });
        } catch (err) {
            console.error('Error actualizando usuario:', err);

            if (err.code === 'DUPLICATE_USER') {
                return res.status(409).json({ message: err.message });
            }

            return res.status(500).json({
                message: 'Error interno',
                error: err.message,
            });
        }
    }

    static async uploadImagenPerfilById(req, res) {
        const userId = parseInt(req.params.id, 10);
        const file = req.file;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }

        if (!file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const filename = file.originalname;
        const remoteDir = path.posix.join(process.env.FTP_PROFILE_PATH, userId.toString());

        try {
            const user = await UserModel.findById(userId);
            const previousFilename = user?.imagenperfil;

            await withFtp(async (client) => {
                await client.ensureDir(remoteDir);

                if (previousFilename && previousFilename !== filename) {
                    try {
                        await client.remove(path.posix.join(remoteDir, previousFilename));
                    } catch (error) {
                        console.warn('No se pudo eliminar imagen anterior:', error.message);
                    }
                }

                await client.uploadFrom(
                    Readable.from(file.buffer),
                    path.posix.join(remoteDir, filename)
                );
            });

            await UserModel.updateUser(userId, { imagenperfil: filename });

            const publicUrl = `${process.env.IMG_PROFILE_URL}/${userId}/${encodeURIComponent(filename)}`;

            return res.json({
                imagenperfil: filename,
                url: publicUrl,
            });
        } catch (err) {
            console.error('Error al subir imagen (admin):', err);

            return res.status(500).json({
                error: 'Error al subir imagen',
                details: err.message,
            });
        }
    }
}