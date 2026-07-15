import { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { AdminAuthService } from '../../services/AdminAuthService';
import { ApiResponse } from '../../resources/ApiResponse';
import { validationResult } from 'express-validator';

export class AdminAuthController {
  private adminAuthService: AdminAuthService;

  constructor(private prisma: PrismaClient) {
    this.adminAuthService = new AdminAuthService(prisma);
  }

  /**
   * Admin login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json(ApiResponse.validationError(errors.array()));
        return;
      }

      const { email, password } = req.body;
      const result = await this.adminAuthService.login({ email, password });

      if (result.success) {
        res.status(200).json(ApiResponse.success(result.data, result.message));
      } else {
        res.status(401).json(ApiResponse.unauthorized(result.message));
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json(ApiResponse.serverError('An error occurred during login'));
    }
  };

  /**
   * Admin logout
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const result = await this.adminAuthService.logout(userId);

      if (result.success) {
        res.status(200).json(ApiResponse.success(null, result.message));
      } else {
        res.status(500).json(ApiResponse.serverError(result.message));
      }
    } catch (error) {
      console.error('Admin logout error:', error);
      res.status(500).json(ApiResponse.serverError('An error occurred during logout'));
    }
  };

  /**
   * Get admin profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const result = await this.adminAuthService.getProfile(userId);

      if (result.success) {
        res.status(200).json(ApiResponse.success(result.data, result.message));
      } else {
        res.status(404).json(ApiResponse.notFound(result.message));
      }
    } catch (error) {
      console.error('Get admin profile error:', error);
      res.status(500).json(ApiResponse.serverError('An error occurred while retrieving profile'));
    }
  };

  /**
   * Update admin profile
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json(ApiResponse.validationError(errors.array()));
        return;
      }

      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { firstName, lastName, name } = req.body;
      const profileFile = req.file?.filename; // From multer

      const updateData = {
        firstName,
        lastName,
        name,
        profileFile,
      };

      const result = await this.adminAuthService.updateProfile(userId, updateData);

      if (result.success) {
        res.status(200).json(ApiResponse.success(result.data, result.message));
      } else {
        res.status(400).json(ApiResponse.error(result.message, 400));
      }
    } catch (error) {
      console.error('Update admin profile error:', error);
      res.status(500).json(ApiResponse.serverError('An error occurred while updating profile'));
    }
  };

  /**
   * Update admin password
   */
  updatePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json(ApiResponse.validationError(errors.array()));
        return;
      }

      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      const result = await this.adminAuthService.updatePassword(userId, {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (result.success) {
        res.status(200).json(ApiResponse.success(null, result.message));
      } else {
        res.status(400).json(ApiResponse.error(result.message, 400));
      }
    } catch (error) {
      console.error('Update admin password error:', error);
      res.status(500).json(ApiResponse.serverError('An error occurred while updating password'));
    }
  };
}
