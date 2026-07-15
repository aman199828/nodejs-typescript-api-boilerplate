/**
 * Notification Service
 * Handles notification sending logic and business rules
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { firebaseService } from './firebase.service';
import { deviceService } from './device.service';
import { NotificationPayload, CreateNotificationData } from '../types';
import { NOTIFICATION_TYPE } from '../constants';
import { MESSAGE_TYPE } from '../../chat/constants/message.constants';
import { StorageFactory } from '../../../services/storage/storage.factory';

export class NotificationService {
  private prisma: PrismaClient;
  private socketIo: any; // Socket.IO server instance (optional)

  constructor(prismaClient: PrismaClient = prisma, socketIo?: any) {
    this.prisma = prismaClient;
    this.socketIo = socketIo;
  }

  /**
   * Set Socket.IO instance (can be called after initialization)
   */
  public setSocketIO(socketIo: any): void {
    this.socketIo = socketIo;
  }

  /**
   * Check if user is online via Socket.IO
   */
  private isUserOnline(userId: number): boolean {
    try {
      if (!this.socketIo || !this.socketIo.sockets) {
        return false;
      }

      const userRoomName = `user:${userId}`;
      const userRoom = this.socketIo.sockets.adapter.rooms.get(userRoomName);

      return userRoom && userRoom.size > 0;
    } catch (error) {
      console.error('[NotificationService] Error checking if user is online:', error);
      return false;
    }
  }

  /**
   * Send notification via Socket.IO to online users
   */
  private sendNotificationViaSocket(userId: number, notificationData: any): void {
    try {
      if (!this.socketIo) {
        console.warn(
          `[NotificationService] Socket.IO instance not available, cannot send socket notification to user ${userId}`
        );
        return;
      }

      const userRoomName = `user:${userId}`;
      console.log(
        `[NotificationService] Sending socket notification to room: ${userRoomName} for user ${userId}`
      );
      // Use the correct event name from socket types
      this.socketIo.to(userRoomName).emit('notification_received', notificationData);
      console.log(`[NotificationService] Notification sent via socket to user ${userId}`);
    } catch (error) {
      console.error('[NotificationService] Error sending notification via socket:', error);
    }
  }

  /**
   * Send message notification
   * @param recipientId - User ID of the message recipient
   * @param senderId - User ID of the message sender
   * @param message - Message object
   * @param conversation - Conversation object
   * @param isRecipientOnline - Whether the recipient is currently online (optional, defaults to false)
   */
  async sendMessageNotification(
    recipientId: number,
    senderId: number,
    message: any,
    conversation: any,
    isRecipientOnline: boolean = false
  ): Promise<void> {
    try {
      // Note: Callers (message controller, socket handlers) already check if recipient is online/in-room
      // before calling this method. This parameter is kept for logging purposes only.
      if (isRecipientOnline) {
        console.log(
          `[NotificationService] User ${recipientId} is online, but notification requested (user may not be in conversation room)`
        );
      }

      // Check if recipient has notifications enabled for this conversation
      console.log(
        `[NotificationService] Checking if should send notification to user ${recipientId} for conversation ${conversation.id}`
      );
      const shouldSend = await this.shouldSendNotification(recipientId, conversation.id);
      console.log(
        `[NotificationService] shouldSendNotification returned: ${shouldSend} for user ${recipientId}`
      );
      if (!shouldSend) {
        console.log(
          `[NotificationService] Notifications disabled for user ${recipientId} in conversation ${conversation.id} - NOT SENDING`
        );
        return;
      }
      console.log(
        `[NotificationService] Notifications enabled for user ${recipientId} - proceeding to send`
      );

      // Get sender info
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (!sender) {
        console.error(`[NotificationService] Sender ${senderId} not found`);
        return;
      }

      // Generate message preview based on message type
      const messagePreview = this.getMessagePreview(message);
      const messageType = message.messageType || MESSAGE_TYPE.TEXT;

      // Get sender name
      let senderName = 'Someone';
      if (sender.name) {
        senderName = sender.name;
      } else if (sender.userName) {
        senderName = sender.userName;
      }

      // Generate title based on message type
      let title: string;
      switch (messageType) {
        case MESSAGE_TYPE.IMAGE: // 2
          title = `${senderName} sent you a photo`;
          break;
        case MESSAGE_TYPE.VIDEO: // 3
          title = `${senderName} sent you a video`;
          break;
        case MESSAGE_TYPE.AUDIO: // 4
          title = `${senderName} sent you an audio`;
          break;
        case MESSAGE_TYPE.FILE: // 5
          title = `${senderName} sent you a file`;
          break;
        default:
          title = `${senderName} sent you a message`;
      }

      const body = messagePreview;

      // Get sender profile picture URL (generate full URL if needed)
      const userAvatar = await this.getUserAvatarUrl(sender);
      // Only include imageUrl if it's a valid URL (Firebase requires valid URL or omit the field)
      const imageUrl =
        userAvatar &&
        userAvatar.trim() !== '' &&
        (userAvatar.startsWith('http://') || userAvatar.startsWith('https://'))
          ? userAvatar
          : undefined;

      const payload: NotificationPayload = {
        title,
        body,
        imageUrl,
        data: {
          type: String(NOTIFICATION_TYPE.MESSAGE), // Notification type (1 = message)
          messageType: messageType, // Message type (1=text, 2=image, 3=video, etc.) - FirebaseService will convert to string
          conversationId: conversation.id, // Keep as number, FirebaseService will convert to string
          messageId: message.id, // Keep as number, FirebaseService will convert to string
          senderId: senderId, // Keep as number, FirebaseService will convert to string
          messagePreview: messagePreview,
          userAvatar: userAvatar || '',
          userName: sender.userName || '',
          name: sender.name || '',
        },
        sound: 'default',
      };

      // Create notification record first
      const notificationRecord = await this.createNotification({
        userId: recipientId,
        senderId: senderId,
        type: 'message', // Store as string in DB
        title,
        body,
        data: {
          conversationId: conversation.id,
          messageId: message.id,
          senderId: senderId,
          messageType: message.messageType,
        },
      });

      // Prepare socket notification data
      const socketNotificationData = {
        id: notificationRecord.id,
        uuid: notificationRecord.uuid,
        userId: recipientId,
        senderId: senderId,
        type: 'message',
        title,
        body,
        data: {
          type: String(NOTIFICATION_TYPE.MESSAGE), // Notification type (1 = message)
          messageType: messageType, // Message type (1=text, 2=image, 3=video, etc.) - FirebaseService will convert to string
          conversationId: conversation.id,
          messageId: message.id,
          senderId: senderId,
          messagePreview: messagePreview,
          userAvatar: userAvatar || '',
          userName: sender.userName || '',
          name: sender.name || '',
        },
        isRead: false,
        createdAt: notificationRecord.createdAt.toISOString(),
        updatedAt: notificationRecord.updatedAt.toISOString(),
      };

      // Always send via Socket.IO (user will receive when they come online)
      console.log(
        `[NotificationService] Attempting to send socket notification to user ${recipientId}, socketIo available: ${!!this.socketIo}`
      );
      this.sendNotificationViaSocket(recipientId, socketNotificationData);

      // Always send FCM push notification (regardless of online status)
      // Note: This will silently fail if user has no device tokens registered
      let fcmSent = false;
      try {
        await firebaseService.sendToUser(recipientId, payload);
        fcmSent = true;
      } catch (error) {
        console.error(
          `[NotificationService] Error sending FCM notification to user ${recipientId}:`,
          error
        );
      }

      // Check if user has device tokens (for better logging)
      const devices = await this.prisma.deviceDetails.findMany({
        where: {
          userId: recipientId,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      const hasDevices = devices.length > 0;
      const isOnline = this.isUserOnline(recipientId);

      if (!hasDevices) {
        console.warn(
          `[NotificationService] ⚠️ User ${recipientId} has no active device tokens - push notification not sent`
        );
        console.warn(
          `[NotificationService] User needs to register device via POST /api/v1/mobile/notifications/device`
        );
      }

      console.log(
        `[NotificationService] Message notification sent to user ${recipientId} (socket: sent, FCM: ${fcmSent && hasDevices ? 'sent' : 'skipped (no devices)'}, online: ${isOnline})`
      );
    } catch (error) {
      console.error('[NotificationService] Error sending message notification:', error);
      // Don't throw - notification failure shouldn't break message sending
    }
  }

  /**
   * Send message request notification
   */
  async sendMessageRequestNotification(
    recipientId: number,
    senderId: number,
    request: any
  ): Promise<void> {
    try {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          name: true,
          userName: true,
        },
      });

      if (!sender) {
        return;
      }

      let senderName = 'Someone';
      if (sender.name) {
        senderName = sender.name;
      } else if (sender.userName) {
        senderName = sender.userName;
      }
      const title = 'New Message Request';
      const body = `${senderName} wants to message you`;

      const payload: NotificationPayload = {
        title,
        body,
        data: {
          type: String(NOTIFICATION_TYPE.MESSAGE_REQUEST),
          requestId: request.id, // Keep as number, FirebaseService will convert to string
          senderId: senderId, // Keep as number, FirebaseService will convert to string
        },
        sound: 'default',
      };

      await firebaseService.sendToUser(recipientId, payload);

      await this.createNotification({
        userId: recipientId,
        senderId: senderId,
        type: 'message_request', // Store as string in DB
        title,
        body,
        data: {
          requestId: request.id,
          senderId: senderId,
        },
      });
    } catch (error) {
      console.error('[NotificationService] Error sending message request notification:', error);
    }
  }

  /**
   * Send reaction notification
   */
  async sendReactionNotification(
    messageOwnerId: number,
    reactorId: number,
    messageId: number,
    emoji: string
  ): Promise<void> {
    try {
      // Don't notify if user reacts to their own message
      if (messageOwnerId === reactorId) {
        return;
      }

      const reactor = await this.prisma.user.findUnique({
        where: { id: reactorId },
        select: {
          name: true,
          userName: true,
        },
      });

      if (!reactor) {
        return;
      }

      let reactorName = 'Someone';
      if (reactor.name) {
        reactorName = reactor.name;
      } else if (reactor.userName) {
        reactorName = reactor.userName;
      }
      const title = `${reactorName} reacted`;
      const body = `${emoji} to your message`;

      const payload: NotificationPayload = {
        title,
        body,
        data: {
          type: String(NOTIFICATION_TYPE.REACTION), // Send as string in payload
          messageId: messageId, // Keep as number, FirebaseService will convert to string
          reactorId: reactorId, // Keep as number, FirebaseService will convert to string
          emoji: emoji,
        },
        sound: 'default',
      };

      await firebaseService.sendToUser(messageOwnerId, payload);

      await this.createNotification({
        userId: messageOwnerId,
        senderId: reactorId,
        type: 'reaction', // Store as string in DB
        title,
        body,
        data: {
          messageId: messageId,
          reactorId: reactorId,
          emoji: emoji,
        },
      });
    } catch (error) {
      console.error('[NotificationService] Error sending reaction notification:', error);
    }
  }

  /**
   * Send call notification
   * @param receiverId - User ID receiving the call
   * @param callerId - User ID making the call
   * @param callData - Call information
   * @param caller - Caller user object (optional, will fetch if not provided)
   */
  async sendCallNotification(
    receiverId: number,
    callerId: number,
    callData: {
      callType: number; // 1 for AUDIO, 2 for VIDEO
      conversationId?: number;
      callId?: number;
      agoraToken?: string; // Agora token for receiver
      channelName?: string; // Agora channel name
    },
    caller?: any
  ): Promise<void> {
    try {
      console.log(
        `[NotificationService] 📞 Sending incoming call notification - callerId: ${callerId}, receiverId: ${receiverId}, callData:`,
        callData
      );

      // Get caller info if not provided
      if (!caller) {
        console.log(`[NotificationService] Caller info not provided, fetching from database...`);
        caller = await this.prisma.user.findUnique({
          where: { id: callerId },
          select: {
            id: true,
            name: true,
            userName: true,
            profileFile: true,
            profileFileStorage: true,
          },
        });
      }

      if (!caller) {
        console.error(`[NotificationService] ❌ Caller ${callerId} not found`);
        return;
      }

      console.log(`[NotificationService] ✅ Caller found: ${caller.name || caller.userName}`);

      // Get caller avatar URL
      const callerAvatar = await this.getUserAvatarUrl(caller);
      const callerName = caller.name || caller.userName || 'Unknown';

      console.log(
        `[NotificationService] Avatar URL generated: ${callerAvatar ? callerAvatar : 'No avatar'}`
      );

      // Use valid avatar URL or generate placeholder with random string
      let finalAvatarUrl = callerAvatar;
      if (
        !callerAvatar ||
        callerAvatar.trim() === '' ||
        (!callerAvatar.startsWith('http://') && !callerAvatar.startsWith('https://'))
      ) {
        finalAvatarUrl = this.getPlaceholderImageUrl();
        console.log(
          `[NotificationService] ⚠️ Invalid or missing avatar URL - using placeholder: ${finalAvatarUrl}`
        );
      }

      // Build title and body
      const callTypeLabel = callData.callType === 2 ? 'Video' : 'Audio';
      const title = 'Incoming Call';
      const body = `${callerName} is calling you`;

      // Build notification data
      const notificationData: any = {
        type: String(NOTIFICATION_TYPE.INCOMING_CALL),
        callerId: String(callerId),
        receiverId: String(receiverId),
        callType: String(callData.callType),
        conversationId: callData.conversationId ? String(callData.conversationId) : undefined,
        callId: callData.callId ? String(callData.callId) : undefined,
        userName: callerName,
        userAvatar: callerAvatar || '',
      };

      // Include Agora token and channel name if provided
      if (callData.agoraToken) {
        notificationData.agoraToken = callData.agoraToken;
      }
      if (callData.channelName) {
        notificationData.channelName = callData.channelName;
      }

      console.log(
        `[NotificationService] Notification data:`,
        JSON.stringify(notificationData, null, 2)
      );

      // Send notification with title, body, sound, and data
      // Always include imageUrl (use placeholder if avatar is invalid)
      const payload: NotificationPayload = {
        title,
        body,
        imageUrl: finalAvatarUrl,
        sound: 'default',
        data: notificationData,
      };

      console.log(`[NotificationService] 📤 Sending push notification to receiver ${receiverId}`);

      // Send push notification
      const firebaseResponse = await firebaseService.sendToUser(receiverId, payload);

      if (firebaseResponse) {
        console.log(
          `[NotificationService] 🔥 Raw Firebase response:`,
          JSON.stringify(firebaseResponse, null, 2)
        );
        console.log(
          `[NotificationService] ✅ Push notification sent successfully to receiver ${receiverId} - Success: ${firebaseResponse.successCount}, Failed: ${firebaseResponse.failureCount}`
        );
      } else {
        console.warn(
          `[NotificationService] ⚠️ No Firebase response (likely no active devices for user ${receiverId})`
        );
      }

      // Create notification record (minimal title/body for database)
      const notificationRecordData: any = {
        callerId: callerId,
        receiverId: receiverId,
        callType: callData.callType,
        conversationId: callData.conversationId,
        callId: callData.callId,
      };

      // Include Agora token and channel name in notification record
      if (callData.agoraToken) {
        notificationRecordData.agoraToken = callData.agoraToken;
      }
      if (callData.channelName) {
        notificationRecordData.channelName = callData.channelName;
      }

      const notificationRecord = await this.createNotification({
        userId: receiverId,
        senderId: callerId,
        type: 'incoming_call',
        title: 'Incoming Call', // Minimal for database record
        body: 'Incoming Call', // Minimal for database record
        data: notificationRecordData,
      });

      console.log(
        `[NotificationService] ✅ Incoming call notification complete - callerId: ${callerId}, receiverId: ${receiverId}, notificationId: ${notificationRecord?.id || 'N/A'}`
      );
    } catch (error: any) {
      console.error('[NotificationService] Error sending call notification:', error);
      // Don't throw - notification failure shouldn't break call initiation
    }
  }

  /**
   * Send Call Rejection Notification
   * Notifies the caller when their call is rejected
   */
  async sendCallRejectionNotification(
    callerId: number,
    receiverId: number,
    callData: {
      callType: number;
      conversationId?: number;
      callId?: number;
    }
  ): Promise<void> {
    try {
      console.log(
        `[NotificationService] 📞 Sending call rejection notification - callerId: ${callerId}, receiverId: ${receiverId}, callData:`,
        callData
      );

      // Get receiver info (who rejected the call)
      const receiver = await this.prisma.user.findUnique({
        where: { id: receiverId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (!receiver) {
        console.error(`[NotificationService] ❌ Receiver ${receiverId} not found`);
        return;
      }

      console.log(`[NotificationService] ✅ Receiver found: ${receiver.name || receiver.userName}`);

      // Get receiver avatar URL and name
      const receiverAvatar = await this.getUserAvatarUrl(receiver);
      const receiverName = receiver.name || receiver.userName || 'Unknown';

      console.log(
        `[NotificationService] Avatar URL generated: ${receiverAvatar ? receiverAvatar : 'No avatar'}`
      );

      // Use valid avatar URL or generate placeholder with random string
      let finalAvatarUrl = receiverAvatar;
      if (
        !receiverAvatar ||
        receiverAvatar.trim() === '' ||
        (!receiverAvatar.startsWith('http://') && !receiverAvatar.startsWith('https://'))
      ) {
        finalAvatarUrl = this.getPlaceholderImageUrl();
        console.log(
          `[NotificationService] ⚠️ Invalid or missing avatar URL - using placeholder: ${finalAvatarUrl}`
        );
      }

      // Build title and body
      const title = 'Call Rejected';
      const body = `${receiverName} rejected your call`;

      // Build notification data
      const notificationData: any = {
        type: String(NOTIFICATION_TYPE.CALL_REJECTED),
        callerId: String(callerId),
        receiverId: String(receiverId),
        callType: String(callData.callType),
        conversationId: callData.conversationId ? String(callData.conversationId) : undefined,
        callId: callData.callId ? String(callData.callId) : undefined,
        userName: receiverName,
        userAvatar: receiverAvatar || '',
      };

      console.log(
        `[NotificationService] Notification data:`,
        JSON.stringify(notificationData, null, 2)
      );

      // Send notification with title, body, sound, and data
      // Always include imageUrl (use placeholder if avatar is invalid)
      const payload: NotificationPayload = {
        title,
        body,
        imageUrl: finalAvatarUrl,
        sound: 'default',
        data: notificationData,
      };

      console.log(`[NotificationService] 📤 Sending push notification to caller ${callerId}`);

      // Send push notification
      const firebaseResponse = await firebaseService.sendToUser(callerId, payload);

      if (firebaseResponse) {
        console.log(
          `[NotificationService] 🔥 Raw Firebase response:`,
          JSON.stringify(firebaseResponse, null, 2)
        );
        console.log(
          `[NotificationService] ✅ Push notification sent successfully to caller ${callerId} - Success: ${firebaseResponse.successCount}, Failed: ${firebaseResponse.failureCount}`
        );
      } else {
        console.warn(
          `[NotificationService] ⚠️ No Firebase response (likely no active devices for user ${callerId})`
        );
      }

      // Create notification record (minimal title/body for database)
      const notificationRecordData: any = {
        callerId: callerId,
        receiverId: receiverId,
        callType: callData.callType,
        conversationId: callData.conversationId,
        callId: callData.callId,
      };

      const notificationRecord = await this.createNotification({
        userId: callerId,
        senderId: receiverId,
        type: 'call_rejected',
        title: 'Call Rejected', // Minimal for database record
        body: 'Call Rejected', // Minimal for database record
        data: notificationRecordData,
      });

      console.log(
        `[NotificationService] ✅ Call rejection notification complete - callerId: ${callerId}, receiverId: ${receiverId}, notificationId: ${notificationRecord?.id || 'N/A'}`
      );
    } catch (error: any) {
      console.error('[NotificationService] Error sending call rejection notification:', error);
      // Don't throw - notification failure shouldn't break call rejection
    }
  }

  /**
   * Create notification record in database
   */
  async createNotification(data: CreateNotificationData): Promise<any> {
    try {
      const notificationData: any = {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
      };

      // Add senderId if provided
      if (data.senderId) {
        notificationData.senderId = data.senderId;
      } else {
        notificationData.senderId = null;
      }

      // Add data field
      if (data.data) {
        notificationData.data = data.data;
      } else {
        notificationData.data = {};
      }

      const notification = await this.prisma.notification.create({
        data: notificationData,
      });

      return notification;
    } catch (error) {
      console.error('[NotificationService] Error creating notification record:', error);
      throw error;
    }
  }

  /**
   * Check if notification should be sent
   * Checks conversation mute settings, user preferences, etc.
   */
  async shouldSendNotification(userId: number, conversationId: number): Promise<boolean> {
    try {
      // Check if user has muted this conversation
      // IMPORTANT: Don't filter by deletedAt here - we want to send notifications even if user deleted the conversation
      // The conversation will be restored when a new message arrives, but we still want to notify them
      const participant = await this.prisma.conversationParticipant.findFirst({
        where: {
          userId,
          conversationId,
          // Don't filter by deletedAt - we want to notify even if they deleted the conversation
        },
      });

      if (!participant) {
        console.log(
          `[NotificationService] Participant not found for user ${userId} in conversation ${conversationId} - defaulting to send`
        );
        return true; // Default to sending if participant not found
      }

      console.log(
        `[NotificationService] Participant found for user ${userId}, deletedAt: ${participant.deletedAt}, isMuted: ${participant.isMuted}`
      );

      // Check if conversation is muted
      if (participant.isMuted) {
        console.log(`[NotificationService] Conversation is muted for user ${userId} - NOT SENDING`);
        return false;
      }

      // Note: If notificationsEnabled or mutedUntil fields exist in the schema,
      // uncomment these checks:
      // if (participant.notificationsEnabled === false) {
      //   return false;
      // }
      // if (participant.mutedUntil && participant.mutedUntil > new Date()) {
      //   return false;
      // }

      return true;
    } catch (error) {
      console.error('[NotificationService] Error checking notification preferences:', error);
      // Default to sending on error
      return true;
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userId: number,
    options: {
      limit?: number;
      offset?: number;
      isRead?: boolean;
      type?: number; // Changed to number
    } = {}
  ): Promise<{ notifications: any[]; total: number }> {
    try {
      const where: any = {
        userId,
      };

      if (options.isRead !== undefined) {
        where.isRead = options.isRead;
      }

      // Convert type number to string for database query
      if (options.type !== undefined) {
        let typeString = 'message'; // default
        if (options.type === 1) {
          typeString = 'message';
        } else if (options.type === 2) {
          typeString = 'message_request';
        } else if (options.type === 3) {
          typeString = 'reaction';
        } else if (options.type === 4) {
          typeString = 'group_invite';
        } else if (options.type === 5) {
          typeString = 'group_update';
        } else if (options.type === 6) {
          typeString = 'incoming_call';
        } else if (options.type === 7) {
          typeString = 'missed_call';
        }
        where.type = typeString;
      }

      const notifications = await this.prisma.notification.findMany({
        where,
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
        orderBy: {
          createdAt: 'desc',
        },
        take: options.limit || 20,
        skip: options.offset || 0,
      });

      const total = await this.prisma.notification.count({ where });

      return { notifications, total };
    } catch (error) {
      console.error('[NotificationService] Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Generate message preview text based on message type
   * @param message - Message object with messageType and content
   * @returns Preview text string
   */
  private getMessagePreview(message: any): string {
    const messageType = message.messageType || MESSAGE_TYPE.TEXT;

    switch (messageType) {
      case MESSAGE_TYPE.TEXT: // 1
        // Return text content (truncated if long)
        if (message.content) {
          return message.content.length > 50
            ? message.content.substring(0, 50) + '...'
            : message.content;
        }
        return 'New message';

      case MESSAGE_TYPE.IMAGE: // 2
        return 'Image';

      case MESSAGE_TYPE.VIDEO: // 3
        return 'Video';

      case MESSAGE_TYPE.AUDIO: // 4
        return 'Audio';

      case MESSAGE_TYPE.FILE: // 5
        return 'Document';

      case MESSAGE_TYPE.STORY_REPLY: // 6
        return 'Story reply';

      case MESSAGE_TYPE.DISAPPEARING: // 7
        return 'Disappearing message';

      case MESSAGE_TYPE.POST_SHARE: // 8
        return 'Shared a post';

      case MESSAGE_TYPE.CLIP_SHARE: // 9
        return 'Shared a clip';

      case MESSAGE_TYPE.PROFILE_SHARE: // 10
        return 'Shared a profile';

      case MESSAGE_TYPE.HASHTAG_SHARE: // 11
        return 'Shared a hashtag';

      case MESSAGE_TYPE.LOCATION_SHARE: // 12
        return 'Shared a location';

      default:
        return 'New message';
    }
  }

  /**
   * Get user avatar URL (generate presigned URL if needed)
   * @param user - User object with profileFile and profileFileStorage
   * @returns Avatar URL string or empty string
   */
  private async getUserAvatarUrl(user: any): Promise<string> {
    if (!user.profileFile) {
      return '';
    }

    try {
      // Use getFileUrlWithStorage for consistent URL generation (handles S3 presigned URLs properly)
      const { getFileUrlWithStorage } = await import('../../../utils/file.utils');
      const avatarUrl = await getFileUrlWithStorage(
        user.profileFile,
        user.profileFileStorage || 'local',
        'profile_file'
      );

      return avatarUrl || '';
    } catch (error) {
      console.error('[NotificationService] Error generating avatar URL:', error);
      return '';
    }
  }

  /**
   * Generate a placeholder image URL with random component
   * Used when user avatar is missing or invalid
   */
  private getPlaceholderImageUrl(): string {
    const randomString =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    // Use a simple placeholder image URL (1x1 transparent PNG as data URL)
    return `https://via.placeholder.com/150/000000/FFFFFF?text=${randomString}`;
  }
}
