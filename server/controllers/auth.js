import bcrypt from 'bcrypt';
import moment from 'moment-timezone';
import { UserModel } from '../models/Postgres/usuarios.js';
import { AccessModel } from '../models/Postgres/AccessModel.js';

export class AuthController {
    static async login(req, res) {
        const { username, password } = req.body;

        try {
            const user = await UserModel.findByUsername(username);
            if (!user) {
                console.log('User not found');
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                console.log('Password does not match');
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            const isActive = await UserModel.getActiveSession(user.id);
            if (isActive) {
                console.log('User already logged in');
                return res.status(403).json({ message: 'User already logged in' });
            }

            // Log the access with the correct timezone
            const accessTime = moment().tz('Europe/Madrid').format('YYYY-MM-DD HH:mm:ss');
            await AccessModel.logAccess(user.id, accessTime);

            // Set active session
            await UserModel.setActiveSession(user.id, true);

            console.log('Login successful');
            return res.json({ message: 'Login successful', id: user.id, role: user.role, tipo_jornada: user.tipo_jornada });
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
            // Clear active session
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
}
