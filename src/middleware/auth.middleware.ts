import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { TokenPayload } from '../utils/jwt';
import { ApiResponse } from '../resources/ApiResponse';
import * as crypto from 'crypto';
import { prisma } from '../lib/prisma';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string | null;
        roleId: number;
        isAdmin: boolean;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string | null;
    roleId: number;
    isAdmin: boolean;
  };
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json(ApiResponse.unauthorized('No authentication token provided'));
    }

    // Verify token first
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as TokenPayload;

    // Check if token exists in our database and is not expired
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const validToken = await prisma.authToken.findFirst({
      where: {
        tokenHash,
        userId: decoded.userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!validToken) {
      return res.status(401).json(ApiResponse.unauthorized('Invalid or expired token'));
    }

    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        roleId: true,
        isActive: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return res
        .status(401)
        .json(ApiResponse.unauthorized('User not found or account is inactive'));
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId || 2, // Default to regular user if not set
      isAdmin: user.isAdmin,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);

    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json(ApiResponse.unauthorized('Token has expired'));
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json(ApiResponse.unauthorized('Invalid token'));
    }

    return res.status(500).json(ApiResponse.serverError('Authentication error'));
  }
};

export const admin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json(ApiResponse.forbidden('Access denied. Admin privileges required.'));
  }
  next();
};
