/**
 * Device Controller
 * Handles device details management API endpoints
 */

import { Request, Response } from 'express';
import { DeviceService } from '../services/device.service';
import { DeviceDetailsResource } from '../resources/DeviceDetailsResource';
import { ApiResponse } from '../../../resources/ApiResponse';

export class DeviceController {
  private deviceService: DeviceService;

  constructor() {
    this.deviceService = new DeviceService();
  }

  /**
   * Register or update device with FCM token
   * POST /api/v1/mobile/notifications/device
   */
  registerDevice = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const { fcmToken, deviceType, deviceId, deviceName, osVersion, appVersion } = req.body;

      // Validation
      if (!fcmToken) {
        res.status(400).json(ApiResponse.error('FCM token is required', 400));
        return;
      }

      // Validate device type: 1 = ios, 2 = android, 3 = web
      if (!deviceType || (deviceType !== 1 && deviceType !== 2 && deviceType !== 3)) {
        res
          .status(400)
          .json(
            ApiResponse.error('Valid device type is required (1 = ios, 2 = android, 3 = web)', 400)
          );
        return;
      }

      const device = await this.deviceService.registerDevice(userId, {
        fcmToken,
        deviceType,
        deviceId,
        deviceName,
        osVersion,
        appVersion,
      });

      res
        .status(200)
        .json(
          ApiResponse.success(
            DeviceDetailsResource.transform(device),
            'Device registered successfully'
          )
        );
    } catch (error) {
      console.error('[DeviceController] Error registering device:', error);
      res.status(500).json(ApiResponse.serverError('Failed to register device'));
    }
  };

  /**
   * Remove device
   * DELETE /api/v1/mobile/notifications/device/:deviceId
   */
  removeDevice = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const deviceIdParam = Array.isArray(req.params.deviceId)
        ? req.params.deviceId[0]
        : req.params.deviceId;
      const deviceId = parseInt(deviceIdParam, 10);
      if (isNaN(deviceId)) {
        res.status(400).json(ApiResponse.error('Invalid device ID', 400));
        return;
      }

      await this.deviceService.removeDevice(userId, deviceId);

      res.status(200).json(ApiResponse.success(null, 'Device removed successfully'));
    } catch (error) {
      console.error('[DeviceController] Error removing device:', error);
      res.status(500).json(ApiResponse.serverError('Failed to remove device'));
    }
  };

  /**
   * Get user's devices
   * GET /api/v1/mobile/notifications/devices
   */
  getUserDevices = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Unauthorized', 401));
        return;
      }

      const devices = await this.deviceService.getUserDevices(userId);

      res
        .status(200)
        .json(
          ApiResponse.success(
            DeviceDetailsResource.collection(devices),
            'Devices retrieved successfully'
          )
        );
    } catch (error) {
      console.error('[DeviceController] Error getting user devices:', error);
      res.status(500).json(ApiResponse.serverError('Failed to get devices'));
    }
  };
}
