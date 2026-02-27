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
const SYSTEM_ROLES = ['admin', 'comercial', 'almacen', 'ventas', 'user', 'rrhh', 'administracion', 'administrativo'];
const MAX_ROLE_LENGTH = Number(process.env.MAX_ROLE_LENGTH || 30);

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
            console.log('Attempting login with:', { username, password });

            const user = await UserModel.findByUsername(username);
            if (!user) {
                console.log('User not found:', username);
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                console.log('Password mismatch for user:', username);
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

            await UserModel.storeRefreshToken(user.id, refreshToken);
            await UserModel.setActiveSession(user.id, true);

            console.log('Login successful for user:', username);
            return res.json({ message: 'Login successful', token, refreshToken, user: { id: user.id, role: user.role, tipo_jornada: user.tipo_jornada } });
        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }


    static async updateJornada(req, res) {
        const { userId, tipoJornada } = req.body;

        try {
            const updatedUser = await UserModel.updateJornada(userId, tipoJornada);
            if (!updatedUser) {
                return res.status(404).json({ message: 'User not found' });
            }

            return res.json({ message: 'Jornada updated successfully', user: updatedUser });
        } catch (error) {
            console.error('Error updating jornada:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async logout(req, res) {
        const { userId } = req.body;

        try {
            await UserModel.clearRefreshToken(userId);
            await UserModel.setActiveSession(userId, false);

            console.log('Logout successful');
            return res.json({ message: 'Logout successful' });
        } catch (error) {
            console.error('Error during logout:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async logoutAll(req, res) {
        try {
            // Clear active session for all users
            await UserModel.setActiveSessionForAll(false);

            console.log('Logout all users successful');
            return res.json({ message: 'Logout all users successful' });
        } catch (error) {
            console.error('Error during logout all users:', error);
            res.status(500).json({ message: 'Internal server error' });
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
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async refreshToken(req, res) {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(403).json({ message: 'Refresh token required' });

        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await UserModel.findById(decoded.id);
            if (!user || user.refresh_token !== refreshToken) return res.status(403).json({ message: 'Invalid refresh token' });

            const newToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return res.json({ token: newToken });
        } catch (error) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }
    }
    static async getCommercialUsers(req, res) {
        try {
            const commercialUsers = await UserModel.getCommercialUsers();
            res.json(commercialUsers);
        } catch (error) {
            console.error('Error fetching commercial users:', error);
            res.status(500).json({ message: 'Error fetching commercial users' });
        }
    }
    static async getPerfilUsuario(req, res) {
        try {
            const userId = req.user.id;
            const user = await UserModel.findById(userId);

            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            // Elimina campos sensibles
            const { password, refresh_token, ...safeUser } = user;

            // Añadir imagenperfil_url si existe
            if (safeUser.imagenperfil) {
                safeUser.imagenperfil_url = `${process.env.IMG_PROFILE_URL}/${userId}/${encodeURIComponent(safeUser.imagenperfil)}`;
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
                ...Object.keys(envDefinitions)
            ]);

            const roles = [...roleSet].map((role) => String(role).trim().toLowerCase()).filter(Boolean).sort();

            return res.json({
                roles,
                definitions: envDefinitions
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
            if (!nombre) return res.status(400).json({ message: 'Nombre de departamento requerido' });

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

            const usersWithImageUrls = users.map((u) => {
                const imageUrl = u.imagenperfil
                    ? `${process.env.IMG_PROFILE_URL}/${u.id}/${encodeURIComponent(u.imagenperfil)}`
                    : null;
                return {
                    ...u,
                    imagenperfil_url: imageUrl
                };
            });

            res.json(usersWithImageUrls);
        } catch (err) {
            console.error('Error al obtener usuarios:', err);
            res.status(500).json({ message: 'Error interno' });
        }
    }


    static async updateRole(req, res) {
        const { userId, newRole } = req.body;
        try {
            const result = await UserModel.updateRole(userId, newRole);
            res.json(result);
        } catch (err) {
            console.error('Error al actualizar rol:', err);
            res.status(500).json({ message: 'Error interno' });
        }
    }


    static async createUserWithImage(req, res) {
        const { nombre, username, email, password, role, departamento, dias_vacaciones_anuales } = req.body;
        const file = req.file;

        if (!nombre || !username || !email || !password || !role) {
            return res.status(400).json({ message: 'Faltan datos obligatorios' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            let imagenperfil = null;

            // 1. Crear usuario (sin imagen aún)
            const newUser = await UserModel.createUser({
                nombre,
                username,
                email,
                password: hashedPassword,
                role,
                departamento: departamento || null,
                dias_vacaciones_anuales: dias_vacaciones_anuales ? Number(dias_vacaciones_anuales) : null,
            });

            // 2. Subir imagen si fue enviada
            if (file) {
                const userId = newUser.id;
                imagenperfil = file.originalname;
                const remoteDir = path.posix.join(process.env.FTP_PROFILE_PATH, userId.toString());

                await withFtp(async (client) => {
                    await client.ensureDir(remoteDir);
                    await client.uploadFrom(Readable.from(file.buffer), path.posix.join(remoteDir, imagenperfil));
                });

                // 3. Actualizar campo imagenperfil
                await UserModel.updateUser(userId, { imagenperfil });
            }

            // 4. Devolver usuario creado con URL de imagen
            const publicUrl = imagenperfil
                ? `${process.env.IMG_PROFILE_URL}/${newUser.id}/${encodeURIComponent(imagenperfil)}`
                : null;

            res.status(201).json({
                message: 'Usuario creado correctamente',
                user: {
                    ...newUser,
                    imagenperfil,
                    imagenperfil_url: publicUrl,
                },
            });
        } catch (err) {
            console.error('Error al crear usuario con imagen:', err);
            res.status(500).json({ message: 'Error al crear usuario', error: err.message });
        }
    }

    static async deleteUser(req, res) {
        const { id } = req.params;
        try {
            await UserModel.deleteUser(id);
            res.json({ message: 'Usuario eliminado' });
        } catch (err) {
            console.error('Error al eliminar usuario:', err);
            if (err.code === '23503') {
                return res.status(409).json({
                    message: 'No se puede eliminar el usuario porque tiene registros relacionados en otras tablas',
                    constraint: err.constraint,
                    detail: err.detail
                });
            }
            res.status(500).json({ message: 'Error interno' });
        }
    }
    static async updateUser(req, res) {
        const { id } = req.params;
        const { nombre, username, email, departamento, dias_vacaciones_anuales } = req.body;

        // Si no se envió ningún campo, devolvemos error
        if (!nombre && !username && !email && departamento === undefined && dias_vacaciones_anuales === undefined) {
            return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
        }

        try {
            const campos = [];
            const valores = [];
            let idx = 1;

            if (nombre !== undefined) {
                campos.push(`nombre = $${idx++}`);
                valores.push(nombre);
            }
            if (username !== undefined) {
                campos.push(`username = $${idx++}`);
                valores.push(username);
            }
            if (email !== undefined) {
                campos.push(`email = $${idx++}`);
                valores.push(email);
            }
            if (departamento !== undefined) {
                campos.push(`departamento = $${idx++}`);
                valores.push(departamento || null);
            }
            if (dias_vacaciones_anuales !== undefined) {
                campos.push(`dias_vacaciones_anuales = $${idx++}`);
                valores.push(dias_vacaciones_anuales === '' || dias_vacaciones_anuales === null ? null : Number(dias_vacaciones_anuales));
            }

            valores.push(id);

            const query = `
            UPDATE usuarios 
            SET ${campos.join(', ')}
            WHERE id = $${idx}
        `;

            const result = await pool.query(query, valores);

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            res.json({ message: 'Usuario actualizado correctamente' });
        } catch (err) {
            console.error('Error actualizando usuario:', err);
            res.status(500).json({ message: 'Error interno' });
        }
    }
    static async uploadImagenPerfilById(req, res) {
        const userId = parseInt(req.params.id); // <-- usar el ID de la URL
        const file = req.file;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }

        if (!file) return res.status(400).json({ error: 'No se subió ningún archivo' });

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
                    } catch (e) {
                        console.warn('No se pudo eliminar imagen anterior:', e.message);
                    }
                }
                await client.uploadFrom(Readable.from(file.buffer), path.posix.join(remoteDir, filename));
            });

            // ✅ Aquí estaba el problema: se usaba el ID del token en vez del ID del admin seleccionado
            await UserModel.updateUser(userId, { imagenperfil: filename });

            const publicUrl = `${process.env.IMG_PROFILE_URL}/${userId}/${encodeURIComponent(filename)}`;
            res.json({ imagenperfil: filename, url: publicUrl });
        } catch (err) {
            console.error('Error al subir imagen (admin):', err);
            res.status(500).json({ error: 'Error al subir imagen', details: err.message });
        }
    }

}