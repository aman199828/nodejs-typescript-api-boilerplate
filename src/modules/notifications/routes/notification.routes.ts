/**
 * Notification Routes
 * All notification-related API routes
 */

import { Router } from 'express';
import { mobileAuth } from '../../../middleware/mobile-auth.middleware';
import { DeviceController } from '../controllers/device.controller';
import { NotificationController } from '../controllers/notification.controller';

const router = Router();

// Initialize controllers
const deviceController = new DeviceController();
const notificationController = new NotificationController();

/**
 * @swagger
 * /api/v1/mobile/notifications/device:
 *   post:
 *     summary: Register or update device with FCM token
 *     description: Register a new device or update existing device with FCM token for push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *               - deviceType
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token
 *               deviceType:
 *                 type: string
 *                 enum: [ios, android, web]
 *                 description: Device type
 *               deviceId:
 *                 type: string
 *                 description: Device identifier (optional)
 *               deviceName:
 *                 type: string
 *                 description: Device name (optional)
 *               osVersion:
 *                 type: string
 *                 description: Operating system version (optional)
 *               appVersion:
 *                 type: string
 *                 description: App version (optional)
 */
router.post('/device', mobileAuth, deviceController.registerDevice);

/**
 * @swagger
 * /api/v1/mobile/notifications/device/{deviceId}:
 *   delete:
 *     summary: Remove device
 *     description: Remove a device from user's registered devices
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/device/:deviceId', mobileAuth, deviceController.removeDevice);

/**
 * @swagger
 * /api/v1/mobile/notifications/devices:
 *   get:
 *     summary: Get user's devices
 *     description: Get all active devices registered for the user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/devices', mobileAuth, deviceController.getUserDevices);

/**
 * @swagger
 * /api/v1/mobile/notifications:
 *   get:
 *     summary: Get user's notifications
 *     description: Get notification history with pagination
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 */
router.get('/', mobileAuth, notificationController.getNotifications);

/**
 * @swagger
 * /api/v1/mobile/notifications/{id}:
 *   get:
 *     summary: Get single notification
 *     description: Get details of a specific notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/:id', mobileAuth, notificationController.getNotification);

/**
 * @swagger
 * /api/v1/mobile/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     description: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.put('/:id/read', mobileAuth, notificationController.markAsRead);

/**
 * @swagger
 * /api/v1/mobile/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     description: Mark all user's notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put('/read-all', mobileAuth, notificationController.markAllAsRead);

/**
 * @swagger
 * /api/v1/mobile/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     description: Delete a specific notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/:id', mobileAuth, notificationController.deleteNotification);

export default router;
