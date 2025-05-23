import jwt from 'jsonwebtoken';
import { UserModel } from '../models/Postgres/usuarios.js'; // Asegúrate de que UserModel esté correctamente implementado
import fs from 'fs';
import path from 'path';

export const authMiddleware = async (req, res, next) => {
    console.log('🔐 Entrando en authMiddleware');

    const token = req.headers['authorization']?.split(' ')[1];
    console.log('➡️ Token recibido:', token);

    const tempDir = path.join('C:', 'tmp');
    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
            console.log('📁 Carpeta temporal creada:', tempDir);
        }
    } catch (err) {
        console.error('❌ Error creando carpeta temporal:', err);
    }

    if (!token) {
        console.log('❌ No se proporcionó token');
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    if (token === process.env.INTERNAL_ACCESS_TOKEN) {
        console.log('✅ Token interno detectado');
        req.user = { role: 'internal' };
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token decodificado:', decoded);

        const user = await UserModel.findById(decoded.id);
        console.log('👤 Usuario encontrado:', user);

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (user.role === 'admin') {
            req.user = user;
            return next();
        }

        if (req.requiredRole && user.role !== req.requiredRole) {
            return res.status(403).json({ message: 'Access denied: Insufficient role privileges' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('❌ Error al verificar token:', err);
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

