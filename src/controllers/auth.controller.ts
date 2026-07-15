import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const login = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if password is correct
    if (!user.password) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Please contact support.' });
    }

    // Check user state - only allow active users to login
    if (user.stateId !== null && user.stateId !== 1) {
      // 1 = ACTIVE state
      let statusMessage = 'Account is not active. Please contact support.';

      switch (user.stateId) {
        case 0: // INACTIVE
          statusMessage = 'Account is inactive. Please contact support.';
          break;
        case 3: // PENDING
          statusMessage = 'Account is pending approval. Please wait for admin approval.';
          break;
        case 4: // DELETED
          statusMessage = 'Account has been deleted. Please contact support.';
          break;
        case 5: // REJECTED
          statusMessage = 'Account has been rejected. Please contact support.';
          break;
        case 6: // BLOCKED
          statusMessage = 'Account has been blocked. Please contact support.';
          break;
        default:
          statusMessage = 'Account status is invalid. Please contact support.';
      }

      return res.status(403).json({ message: statusMessage });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        countryCode: user.countryCode,
        country: (user as any).country ?? null,
        roleId: user.roleId,
        isAdmin: user.roleId === 1, // For backward compatibility
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign({ id: user.id }, JWT_SECRET + (user.password || ''), {
      expiresIn: '1h',
    });

    // In a real app, you would send an email with the reset token
    // For now, we'll just return the token in the response
    res.json({
      message: 'Password reset token generated',
      token: resetToken,
      userId: user.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({ message: 'Token and user ID are required' });
    }

    // Find user by ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid user' });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, JWT_SECRET + (user.password || '')) as { id: string };
      if (decoded.id !== userId) {
        throw new Error('Invalid token');
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user.userId;

    // Find user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    if (!user.password) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        countryCode: true,
        country: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { name, email } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, email },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        countryCode: true,
        country: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
