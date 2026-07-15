/**
 * Firebase Service
 * Handles Firebase Cloud Messaging (FCM) push notifications
 */

import * as admin from 'firebase-admin';
import { NotificationPayload } from '../types';
import { prisma } from '../lib/prisma';

export class FirebaseService {
  private initialized: boolean = false;

  /**
   * Initialize Firebase Admin SDK
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        this.initialized = true;
        console.log('[FirebaseService] Firebase already initialized');
        return;
      }

      // Initialize from service account file or environment variable
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      const projectId = process.env.FIREBASE_PROJECT_ID;

      if (serviceAccountBase64) {
        // Decode base64 service account
        const serviceAccount = JSON.parse(
          Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
        );
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: projectId || serviceAccount.project_id,
        });
      } else if (serviceAccountPath) {
        // Load from file - resolve path relative to project root
        const path = require('path');
        const fs = require('fs');

        // If path is relative, resolve it relative to project root (where package.json is)
        // In production, dist/ is the working directory, so go up one level
        let resolvedPath = serviceAccountPath;
        if (!path.isAbsolute(serviceAccountPath)) {
          // Try project root (one level up from dist/)
          const projectRoot = path.resolve(__dirname, '../../../../');
          resolvedPath = path.resolve(projectRoot, serviceAccountPath);

          // If file doesn't exist there, try current working directory
          if (!fs.existsSync(resolvedPath)) {
            resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
          }
        }

        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
          console.error(
            `[FirebaseService] Firebase service account file not found at: ${resolvedPath}`
          );
          console.error(
            `[FirebaseService] Tried paths: ${resolvedPath}, ${path.resolve(process.cwd(), serviceAccountPath)}`
          );
          return;
        }

        const serviceAccount = require(resolvedPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: projectId || serviceAccount.project_id,
        });
      } else {
        console.warn(
          '[FirebaseService] Firebase credentials not found. Push notifications will be disabled.'
        );
        return;
      }

      this.initialized = true;
      console.log('[FirebaseService] Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('[FirebaseService] Failed to initialize Firebase:', error);
      this.initialized = false;
    }
  }

  /**
   * Send notification to a single FCM token
   */
  async sendToToken(token: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.initialized) {
      this.initialize();
      if (!this.initialized) {
        console.warn('[FirebaseService] Firebase not initialized, skipping notification');
        return false;
      }
    }

    try {
      const message: admin.messaging.Message = {
        token,
        data: this.convertDataToStrings(payload.data ? payload.data : {}),
      };

      // Only include notification field if title/body are provided (for display notifications)
      if (payload.title || payload.body) {
        message.notification = {
          title: payload.title || '',
          body: payload.body || '',
          imageUrl: payload.imageUrl,
        };
        message.android = {
          priority: 'high',
          notification: {
            sound: payload.sound ? payload.sound : 'default',
            channelId: 'chat_notifications',
          },
        };
        message.apns = {
          payload: {
            aps: {
              sound: payload.sound ? payload.sound : 'default',
              badge: payload.badge,
            },
          },
        };
        message.webpush = {
          notification: {
            icon: '/static/icons/app-icon.png',
            badge: '/static/icons/badge-icon.png',
            requireInteraction: false,
          },
        };
      } else {
        // Data-only notification (silent notification)
        message.android = {
          priority: 'high',
        };
        message.apns = {
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        };
      }

      const response = await admin.messaging().send(message);
      console.log('[FirebaseService] Notification sent successfully:', response);
      return true;
    } catch (error: any) {
      console.error('[FirebaseService] Error sending notification:', error);

      // Handle invalid token
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        // Deactivate token in database
        await this.deactivateToken(token);
      }

      return false;
    }
  }

  /**
   * Send notification to multiple tokens (batch)
   */
  async sendToTokens(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<admin.messaging.BatchResponse> {
    if (!this.initialized) {
      this.initialize();
      if (!this.initialized) {
        console.warn('[FirebaseService] Firebase not initialized, skipping notifications');
        return {
          successCount: 0,
          failureCount: tokens.length,
          responses: [],
        };
      }
    }

    if (tokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        responses: [],
      };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        data: this.convertDataToStrings(payload.data ? payload.data : {}),
      };

      // Only include notification field if title/body are provided (for display notifications)
      if (payload.title || payload.body) {
        message.notification = {
          title: payload.title || '',
          body: payload.body || '',
          imageUrl: payload.imageUrl,
        };
        message.android = {
          priority: 'high',
          notification: {
            sound: payload.sound ? payload.sound : 'default',
            channelId: 'chat_notifications',
          },
        };
        message.apns = {
          payload: {
            aps: {
              sound: payload.sound ? payload.sound : 'default',
              badge: payload.badge,
            },
          },
        };
        message.webpush = {
          notification: {
            icon: '/static/icons/app-icon.png',
            badge: '/static/icons/badge-icon.png',
            requireInteraction: false,
          },
        };
      } else {
        // Data-only notification (silent notification)
        message.android = {
          priority: 'high',
        };
        message.apns = {
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        };
      }

      const response = await admin.messaging().sendEachForMulticast(message);

      // Handle invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        for (let idx = 0; idx < response.responses.length; idx++) {
          const resp = response.responses[idx];
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(tokens[idx]);
            }
          }
        }

        // Deactivate invalid tokens
        if (invalidTokens.length > 0) {
          for (let i = 0; i < invalidTokens.length; i++) {
            await this.deactivateToken(invalidTokens[i]);
          }
        }
      }

      console.log(`[FirebaseService] Sent ${response.successCount}/${tokens.length} notifications`);
      return response;
    } catch (error) {
      console.error('[FirebaseService] Error sending batch notifications:', error);
      return {
        successCount: 0,
        failureCount: tokens.length,
        responses: [],
      };
    }
  }

  /**
   * Send notification to all user's active devices
   * Returns the raw Firebase response or null if no devices found
   */
  async sendToUser(userId: number, payload: NotificationPayload): Promise<any> {
    try {
      // Get all active device tokens for user
      const devices = await prisma.deviceDetails.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          fcmToken: true,
          id: true,
        },
      });

      if (devices.length === 0) {
        console.warn(
          `[FirebaseService] ⚠️ No active devices found for user ${userId} - notification will not be sent`
        );
        console.warn(
          `[FirebaseService] User ${userId} needs to register device token via POST /api/v1/mobile/notifications/device`
        );
        // Return null - can't send notification without device token
        return null;
      }

      const tokens = [];
      for (let i = 0; i < devices.length; i++) {
        tokens.push(devices[i].fcmToken);
      }
      const response = await this.sendToTokens(tokens, payload);

      // Update lastUsedAt for all devices
      await prisma.deviceDetails.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          lastUsedAt: new Date(),
        },
      });

      return response;
    } catch (error) {
      console.error(`[FirebaseService] Error sending to user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Validate FCM token
   */
  async validateToken(token: string): Promise<boolean> {
    if (!this.initialized) {
      this.initialize();
      if (!this.initialized) {
        return false;
      }
    }

    try {
      // Try to send a test message (Firebase will validate the token)
      await admin.messaging().send(
        {
          token,
          data: { test: 'validation' },
        },
        true
      ); // dryRun = true (doesn't actually send)
      return true;
    } catch (error: any) {
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        return false;
      }
      // Other errors might be temporary, assume valid
      return true;
    }
  }

  /**
   * Deactivate invalid token in database
   */
  private async deactivateToken(token: string): Promise<void> {
    try {
      await prisma.deviceDetails.updateMany({
        where: {
          fcmToken: token,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
      console.log(`[FirebaseService] Deactivated invalid token`);
    } catch (error) {
      console.error('[FirebaseService] Error deactivating token:', error);
    }
  }

  /**
   * Convert data object to strings (FCM requirement)
   */
  private convertDataToStrings(data: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      result[key] = String(data[key]);
    }
    return result;
  }
}

// Singleton instance
export const firebaseService = new FirebaseService();

// Initialize on module load
firebaseService.initialize();
