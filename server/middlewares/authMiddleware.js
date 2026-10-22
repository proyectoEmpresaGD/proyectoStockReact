import jwt from 'jsonwebtoken';
import { UserModel } from '../models/Postgres/usuarios.js';
import { createAuthMiddleware } from './authMiddlewareCore.js';

export const authMiddleware = createAuthMiddleware({
  verifyToken: (token) => jwt.verify(token, process.env.JWT_SECRET),
  findUser: (userId) => UserModel.findById(userId),
});
