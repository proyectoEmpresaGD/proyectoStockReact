// controllers/auth.js
import bcrypt from 'bcrypt';
import { UserModel } from '../models/Postgres/usuarios.js';

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

            console.log('Login successful');
            return res.json({ message: 'Login successful', id: user.id, role: user.role });
        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
