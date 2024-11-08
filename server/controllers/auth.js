import bcrypt from 'bcrypt';
import moment from 'moment-timezone';
import { UserModel } from '../models/Postgres/usuarios.js';
import { AccessModel } from '../models/Postgres/AccessModel.js';
import jwt from 'jsonwebtoken';

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
}
