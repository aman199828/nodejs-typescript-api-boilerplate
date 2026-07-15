/**
 * Notification Types
 */

export interface NotificationPayload {
  title: string;
  body: string;
  data?: {
    type: string;
    conversationId?: number;
    messageId?: number;
    senderId?: number;
    requestId?: number;
    messageType?: number; // Message type (1=text, 2=image, etc.) - kept as number, will be converted to string by FirebaseService
    messagePreview?: string; // Preview text of the message
    userAvatar?: string; // Avatar URL of the sender
    userName?: string; // Username of the sender
    name?: string; // Name of the sender
    [key: string]: any;
  };
  imageUrl?: string; // For media notifications (sender profile picture)
  sound?: string;
  badge?: number;
}

export interface CreateNotificationData {
  userId: number;
  senderId?: number;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface DeviceDetailsData {
  fcmToken: string;
  deviceType: number; // 1 = ios, 2 = android, 3 = web
  deviceId?: string;
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
}
