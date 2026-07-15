/**
 * Notification Controller
 * Handles notification history API endpoints
 */

import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { NotificationResource } from '../resources/NotificationResource';
import { ApiResponse } from '../../../resources/ApiResponse';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Get user's notifications
   * GET /api/v1/mobile/notifications
   */
  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const isRead =
        req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined;
      const type = req.query.type ? parseInt(req.query.type as string) : undefined;

      const { notifications, total } = await this.notificationService.getUserNotifications(userId, {
        limit,
        offset,
        isRead,
        type,
      });

      // Transform notifications one by one
      const transformedNotifications = [];
      for (let i = 0; i < notifications.length; i++) {
        const transformed = await NotificationResource.transform(notifications[i]);
        transformedNotifications.push(transformed);
      }

      res.status(200).json(
        ApiResponse.success(
          {
            notifications: transformedNotifications,
            total,
            limit,
            offset,
          },
          'Notifications retrieved successfully'
        )
      );
    } catch (error) {
      console.error('[NotificationController] Error getting notifications:', error);
      res.status(500).json(ApiResponse.serverError('Failed to get notifications'));
    }
  };

  /**
   * Get single notification
   * GET /api/v1/mobile/notifications/:id
   */
  getNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const notificationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const notificationId = parseInt(notificationIdParam, 10);
      if (isNaN(notificationId)) {
        res.status(400).json(ApiResponse.error('Invalid notification ID', 400));
        return;
      }

      const notification = await this.notificationService['prisma'].notification.findFirst({
        where: {
          id: notificationId,
          userId, // Ensure user owns the notification
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
        },
      });

      if (!notification) {
        res.status(404).json(ApiResponse.error('Notification not found', 404));
        return;
      }

      const transformed = await NotificationResource.transform(notification);

      res.status(200).json(ApiResponse.success(transformed, 'Notification retrieved successfully'));
    } catch (error) {
      console.error('[NotificationController] Error getting notification:', error);
      res.status(500).json(ApiResponse.serverError('Failed to get notification'));
    }
  };

  /**
   * Mark notification as read
   * PUT /api/v1/mobile/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const notificationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const notificationId = parseInt(notificationIdParam, 10);
      if (isNaN(notificationId)) {
        res.status(400).json(ApiResponse.error('Invalid notification ID', 400));
        return;
      }

      await this.notificationService['prisma'].notification.updateMany({
        where: {
          id: notificationId,
          userId, // Ensure user owns the notification
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      res.status(200).json(ApiResponse.success(null, 'Notification marked as read'));
    } catch (error) {
      console.error('[NotificationController] Error marking notification as read:', error);
      res.status(500).json(ApiResponse.serverError('Failed to mark notification as read'));
    }
  };

  /**
   * Mark all notifications as read
   * PUT /api/v1/mobile/notifications/read-all
   */
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      await this.notificationService['prisma'].notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      res.status(200).json(ApiResponse.success(null, 'All notifications marked as read'));
    } catch (error) {
      console.error('[NotificationController] Error marking all notifications as read:', error);
      res.status(500).json(ApiResponse.serverError('Failed to mark all notifications as read'));
    }
  };

  /**
   * Delete notification
   * DELETE /api/v1/mobile/notifications/:id
   */
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const notificationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const notificationId = parseInt(notificationIdParam, 10);
      if (isNaN(notificationId)) {
        res.status(400).json(ApiResponse.error('Invalid notification ID', 400));
        return;
      }

      await this.notificationService['prisma'].notification.deleteMany({
        where: {
          id: notificationId,
          userId, // Ensure user owns the notification
        },
      });

      res.status(200).json(ApiResponse.success(null, 'Notification deleted successfully'));
    } catch (error) {
      console.error('[NotificationController] Error deleting notification:', error);
      res.status(500).json(ApiResponse.serverError('Failed to delete notification'));
    }
  };
}
