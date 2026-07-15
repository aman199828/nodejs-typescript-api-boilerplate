/**
 * Device Service
 * Handles device details CRUD operations
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { DeviceDetailsData } from '../types';

export class DeviceService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * Register or update device with FCM token
   * One user = one device: updates existing device entry if user already has one
   */
  async registerDevice(userId: number, deviceData: DeviceDetailsData): Promise<any> {
    try {
      // Find existing device for this user (one user = one device)
      const existing = await this.prisma.deviceDetails.findFirst({
        where: {
          userId,
        },
        orderBy: {
          lastUsedAt: 'desc', // Get the most recently used device
        },
      });

      if (existing) {
        // Update existing device with new FCM token and device details
        return await this.prisma.deviceDetails.update({
          where: {
            id: existing.id,
          },
          data: {
            fcmToken: deviceData.fcmToken, // Update FCM token (may have changed)
            deviceType: this.convertDeviceTypeToString(deviceData.deviceType),
            deviceId: deviceData.deviceId || null,
            deviceName: deviceData.deviceName || null,
            osVersion: deviceData.osVersion || null,
            appVersion: deviceData.appVersion || null,
            isActive: true,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new device (first time login)
        return await this.prisma.deviceDetails.create({
          data: {
            userId,
            fcmToken: deviceData.fcmToken,
            deviceType: this.convertDeviceTypeToString(deviceData.deviceType),
            deviceId: deviceData.deviceId || null,
            deviceName: deviceData.deviceName || null,
            osVersion: deviceData.osVersion || null,
            appVersion: deviceData.appVersion || null,
            isActive: true,
            lastUsedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error('[DeviceService] Error registering device:', error);
      throw error;
    }
  }

  /**
   * Remove device
   */
  async removeDevice(userId: number, deviceId: number): Promise<void> {
    try {
      await this.prisma.deviceDetails.deleteMany({
        where: {
          id: deviceId,
          userId, // Ensure user owns the device
        },
      });
    } catch (error) {
      console.error('[DeviceService] Error removing device:', error);
      throw error;
    }
  }

  /**
   * Get user's active devices
   */
  async getUserDevices(userId: number): Promise<any[]> {
    try {
      return await this.prisma.deviceDetails.findMany({
        where: {
          userId,
          isActive: true,
        },
        orderBy: {
          lastUsedAt: 'desc',
        },
      });
    } catch (error) {
      console.error('[DeviceService] Error getting user devices:', error);
      throw error;
    }
  }

  /**
   * Deactivate device
   */
  async deactivateDevice(deviceId: number): Promise<void> {
    try {
      await this.prisma.deviceDetails.update({
        where: {
          id: deviceId,
        },
        data: {
          isActive: false,
        },
      });
    } catch (error) {
      console.error('[DeviceService] Error deactivating device:', error);
      throw error;
    }
  }

  /**
   * Activate device
   */
  async activateDevice(deviceId: number): Promise<void> {
    try {
      await this.prisma.deviceDetails.update({
        where: {
          id: deviceId,
        },
        data: {
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[DeviceService] Error activating device:', error);
      throw error;
    }
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(deviceId: number): Promise<void> {
    try {
      await this.prisma.deviceDetails.update({
        where: {
          id: deviceId,
        },
        data: {
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[DeviceService] Error updating last used:', error);
      // Don't throw, this is not critical
    }
  }

  /**
   * Get active FCM tokens for user
   */
  async getUserFcmTokens(userId: number): Promise<string[]> {
    try {
      const devices = await this.prisma.deviceDetails.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          fcmToken: true,
        },
      });

      const tokens = [];
      for (let i = 0; i < devices.length; i++) {
        tokens.push(devices[i].fcmToken);
      }
      return tokens;
    } catch (error) {
      console.error('[DeviceService] Error getting FCM tokens:', error);
      return [];
    }
  }

  /**
   * Convert device type number to string for database storage
   */
  private convertDeviceTypeToString(deviceType: number): string {
    if (deviceType === 1) return 'ios';
    if (deviceType === 2) return 'android';
    if (deviceType === 3) return 'web';
    return 'web'; // default
  }
}

// Singleton instance
export const deviceService = new DeviceService();
