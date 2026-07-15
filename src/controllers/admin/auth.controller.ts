import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import bcrypt from 'bcrypt';
import { generateToken } from '../../utils/jwt';
import { User } from '../../models/User';
import * as crypto from 'crypto';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Find user by email with minimal required fields
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        isActive: true,
        roleId: true,
        firstName: true,
        lastName: true,
        isVerified: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Create user instance with proper type
    const userInstance = new User({
      ...user,
      id: user.id.toString(),
      roleId: user.roleId || 1, // Default to admin role if not set
      isVerified: user.isVerified || false,
      isActive: true,
    } as any);

    // Generate JWT token
    const token = userInstance.generateAuthToken();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store token hash in database
    await prisma.authToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Return user data and token
    return res.status(200).json({
      success: true,
      data: {
        user: userInstance.toSafeUser(),
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    const status = (error as any).status || 500;
    const message = (error as any).response?.message || 'An error occurred during login';
    const errorMessage =
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined;

    return res.status(status).json({
      success: false,
      message,
      error: errorMessage,
    });
  }
};

// Using AuthenticatedRequest from auth middleware

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // The auth middleware should have attached the user to the request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    // Get fresh user data
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        profileFile: true,
        isVerified: true,
        emailVerifiedAt: true,
        roleId: true,
        typeId: true,
        stateId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching user data',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      // Create hash of the token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Delete the token from the database
      await prisma.authToken.deleteMany({
        where: {
          tokenHash,
          userId: req.user?.id,
        },
      });
      return res.status(200).json({
        success: true,
        message: 'Successfully logged out from this device',
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during logout',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
};
