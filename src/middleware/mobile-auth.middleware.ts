import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Check if token is blacklisted
 */
const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const blacklistedToken = await prisma.tokenBlacklist.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
  });
  return !!blacklistedToken;
};

/**
 * Quick pre-check middleware - validates Authorization header exists BEFORE multer processes files
 * This prevents large file uploads when token is missing
 *
 * ⚡ CRITICAL: This runs synchronously before any body parsing
 */
export const quickAuthCheck = (req: Request, res: Response, next: NextFunction) => {
  // Check Authorization header immediately (headers are available before body)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Reject immediately - don't let multer even start
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
    // End the response immediately to stop any further processing
    res.end();
    return;
  }

  next();
};

/**
 * Mobile authentication middleware
 * Validates JWT token and checks blacklist
 */
export const mobileAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Verify user exists
    console.log('[mobileAuth] Looking up user with ID:', decoded.userId);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        roleId: true,
        isActive: true,
        isAdmin: true,
      },
    });

    console.log(
      '[mobileAuth] User lookup result:',
      user ? `Found: ${user.id} (${user.email})` : 'NOT FOUND'
    );

    if (!user) {
      // Debug: Try to find any user to verify database connection
      const testUser = await prisma.user.findFirst({
        select: { id: true, email: true },
      });
      console.log(
        '[mobileAuth] Database test - any user found:',
        testUser ? `Yes, ID: ${testUser.id}` : 'No users in database'
      );

      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId || 2, // Default to regular user
      isAdmin: user.isAdmin,
    };

    console.log('mobileAuth: User authenticated', { userId: user.id, email: user.email });
    next();
  } catch (error) {
    console.error('Mobile auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

/**
 * Mobile authentication middleware (strict version)
 * Validates JWT token, checks blacklist, and ensures user exists and is active
 */
export const mobileAuthStrict = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Verify user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        roleId: true,
        isActive: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found or deleted',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated',
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId || 2,
      isAdmin: user.isAdmin,
    };

    next();
  } catch (error) {
    console.error('Mobile auth strict error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};
