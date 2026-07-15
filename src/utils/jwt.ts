import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: number; // Changed to number to match Prisma schema
  email: string | null;
  roleId: number;
  iat?: number;
  exp?: number;
}

export const generateToken = (user: {
  id: number;
  email: string | null;
  roleId: number;
}): string => {
  const payload: TokenPayload = {
    userId: user.id, // No need for toString() since ID is number
    email: user.email,
    roleId: user.roleId || 2, // Default to 2 (regular user) if not set
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as SignOptions);
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    // Ensure required fields are present
    if (!payload.userId || !payload.email || !payload.roleId) {
      throw new Error('Invalid token payload');
    }
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
};

export const getTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  return null;
};
