import jwt from 'jsonwebtoken';
import { UserModel } from '../models/Postgres/usuarios.js'; // Asegúrate de que UserModel esté correctamente implementado

export const authMiddleware = async (req, res, next) => {
    // Obtener el token del encabezado de autorización
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

    try {
        // Verificar el token JWT usando la clave secreta
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Buscar al usuario correspondiente al ID en la base de datos
        const user = await UserModel.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Si el usuario es 'admin', permitir acceso completo a todas las rutas
        if (user.role === 'admin') {
            req.user = user; // Almacenar la información del usuario en la solicitud
            return next(); // Continuar con la solicitud
        }

        // Verificar si la ruta requiere un rol específico y si el usuario lo tiene
        if (req.requiredRole && user.role !== req.requiredRole) {
            return res.status(403).json({ message: 'Access denied: Insufficient role privileges' });
        }

        // Si todo está bien, almacenar al usuario en la solicitud y continuar
        req.user = user;
        next();
    } catch (err) {
        // Manejar el caso de un token inválido o expirado
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
