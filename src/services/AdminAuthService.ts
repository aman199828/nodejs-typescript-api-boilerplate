import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, User } from '@prisma/client';
import { UserRepository } from '../repositories/UserRepository';
import { AuthTokenRepository } from '../repositories/AuthTokenRepository';
import { ApiResponse } from '../resources/ApiResponse';
import { UserResource } from '../resources/UserResource';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  name?: string;
  profileFile?: string;
}

export interface UpdatePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export class AdminAuthService {
  private userRepository: UserRepository;
  private authTokenRepository: AuthTokenRepository;

  constructor(private prisma: PrismaClient) {
    this.userRepository = new UserRepository(prisma);
    this.authTokenRepository = new AuthTokenRepository(prisma);
  }

  /**
   * Admin login
   */
  async login(
    credentials: LoginCredentials
  ): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      const { email, password } = credentials;

      // Find admin user by email
      const user = await this.userRepository.findAdminByEmail(email);
      if (!user) {
        return {
          success: false,
          message: 'Invalid credentials',
        };
      }

      // Check if user has a password set
      if (!user.password) {
        return {
          success: false,
          message: 'Account not properly configured. Please contact administrator.',
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid credentials',
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          message: 'Account is inactive. Please contact administrator.',
        };
      }

      // Generate JWT token
      const token = this.generateToken(user);
      const tokenHash = this.hashToken(token);

      // Create auth token record
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      await this.authTokenRepository.createToken(user.id, tokenHash, expiresAt);

      // Update last login
      await this.userRepository.updateLastLogin(user.id);

      // Return user data with token
      const userResource = new UserResource(user);
      return {
        success: true,
        data: {
          user: userResource.toJSON(),
          token,
          expiresAt,
        },
        message: 'Login successful',
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'An error occurred during login',
      };
    }
  }

  /**
   * Admin logout
   */
  async logout(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      // Delete all user tokens
      await this.authTokenRepository.deleteAllUserTokens(userId);

      return {
        success: true,
        message: 'Logout successful',
      };
    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        message: 'An error occurred during logout',
      };
    }
  }

  /**
   * Get admin profile
   */
  async getProfile(userId: number): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isAdmin) {
        return {
          success: false,
          message: 'Admin user not found',
        };
      }

      const userResource = new UserResource(user);
      return {
        success: true,
        data: {
          user: userResource.toJSON(),
        },
        message: 'Profile retrieved successfully',
      };
    } catch (error) {
      console.error('Get profile error:', error);
      return {
        success: false,
        message: 'An error occurred while retrieving profile',
      };
    }
  }

  /**
   * Update admin profile
   */
  async updateProfile(
    userId: number,
    data: UpdateProfileData
  ): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isAdmin) {
        return {
          success: false,
          message: 'Admin user not found',
        };
      }

      // Prepare update data
      const updateData: any = {};
      if (data.firstName) updateData.firstName = data.firstName;
      if (data.lastName) updateData.lastName = data.lastName;
      if (data.name) updateData.name = data.name;
      if (data.profileFile) updateData.profileFile = data.profileFile;

      // Update user
      const updatedUser = await this.userRepository.update(userId, updateData);
      if (!updatedUser) {
        return {
          success: false,
          message: 'Failed to update profile',
        };
      }

      const userResource = new UserResource(updatedUser);
      return {
        success: true,
        data: {
          user: userResource.toJSON(),
        },
        message: 'Profile updated successfully',
      };
    } catch (error) {
      console.error('Update profile error:', error);
      return {
        success: false,
        message: 'An error occurred while updating profile',
      };
    }
  }

  /**
   * Update admin password
   */
  async updatePassword(
    userId: number,
    data: UpdatePasswordData
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { currentPassword, newPassword, confirmPassword } = data;

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        return {
          success: false,
          message: 'New password and confirmation do not match',
        };
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return {
          success: false,
          message: 'Password must be at least 8 characters long',
        };
      }

      // Get user
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isAdmin) {
        return {
          success: false,
          message: 'Admin user not found',
        };
      }

      // Check if user has a password set
      if (!user.password) {
        return {
          success: false,
          message: 'Account not properly configured. Please contact administrator.',
        };
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return {
          success: false,
          message: 'Current password is incorrect',
        };
      }

      // Check if new password is different from current
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return {
          success: false,
          message: 'New password must be different from current password',
        };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      const updatedUser = await this.userRepository.updatePassword(userId, hashedPassword);
      if (!updatedUser) {
        return {
          success: false,
          message: 'Failed to update password',
        };
      }

      return {
        success: true,
        message: 'Password updated successfully',
      };
    } catch (error) {
      console.error('Update password error:', error);
      return {
        success: false,
        message: 'An error occurred while updating password',
      };
    }
  }

  /**
   * Verify JWT token and get user
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      const tokenHash = this.hashToken(token);

      // Check if token exists in database and is not expired
      const authToken = await this.authTokenRepository.findByTokenHash(tokenHash);
      if (!authToken || authToken.expiresAt < new Date()) {
        return null;
      }

      // Get user
      const user = await this.userRepository.findById(decoded.userId);
      if (!user || !user.isAdmin || !user.isActive) {
        return null;
      }

      return user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
