/**
 * Notification Utilities
 * Helper functions that can be used in any file to send notifications
 * All notification-related utilities are kept in the notifications module
 */

import { NotificationService } from '../services/notification.service';
import { prisma } from '../lib/prisma';

// Create a singleton instance
const notificationService = new NotificationService();

/**
 * Send a message notification to a user
 * Can be called from any file in the project
 *
 * @param recipientId - User ID of the recipient
 * @param senderId - User ID of the sender
 * @param messageId - Message ID
 * @param conversationId - Conversation ID
 * @param isRecipientOnline - Whether recipient is online (optional, defaults to false)
 *
 * @example
 * import { sendMessageNotification } from '@/modules/notifications/utils/notification.utils';
 *
 * await sendMessageNotification(recipientId, senderId, messageId, conversationId, false);
 */
export async function sendMessageNotification(
  recipientId: number,
  senderId: number,
  messageId: number,
  conversationId: number,
  isRecipientOnline: boolean = false
): Promise<void> {
  try {
    // Get message and conversation from database
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
      },
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!message || !conversation) {
      console.error('[sendMessageNotification] Message or conversation not found');
      return;
    }

    await notificationService.sendMessageNotification(
      recipientId,
      senderId,
      message,
      conversation,
      isRecipientOnline
    );
  } catch (error) {
    console.error('[sendMessageNotification] Error:', error);
  }
}

/**
 * Send a message request notification
 * Can be called from any file in the project
 *
 * @param recipientId - User ID of the recipient
 * @param senderId - User ID of the sender
 * @param requestId - Message request ID
 *
 * @example
 * import { sendMessageRequestNotification } from '@/modules/notifications/utils/notification.utils';
 *
 * await sendMessageRequestNotification(recipientId, senderId, requestId);
 */
export async function sendMessageRequestNotification(
  recipientId: number,
  senderId: number,
  requestId: number
): Promise<void> {
  try {
    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      console.error('[sendMessageRequestNotification] Request not found');
      return;
    }

    await notificationService.sendMessageRequestNotification(recipientId, senderId, request);
  } catch (error) {
    console.error('[sendMessageRequestNotification] Error:', error);
  }
}

/**
 * Send a reaction notification
 * Can be called from any file in the project
 *
 * @param messageOwnerId - User ID who owns the message
 * @param reactorId - User ID who reacted
 * @param messageId - Message ID
 * @param emoji - Emoji used in reaction
 *
 * @example
 * import { sendReactionNotification } from '@/modules/notifications/utils/notification.utils';
 *
 * await sendReactionNotification(messageOwnerId, reactorId, messageId, '👍');
 */
export async function sendReactionNotification(
  messageOwnerId: number,
  reactorId: number,
  messageId: number,
  emoji: string
): Promise<void> {
  try {
    await notificationService.sendReactionNotification(messageOwnerId, reactorId, messageId, emoji);
  } catch (error) {
    console.error('[sendReactionNotification] Error:', error);
  }
}

/**
 * Check if a user is online (has active socket connection)
 * Can be called from any file that has access to Socket.IO instance
 *
 * @param socketIo - Socket.IO server instance
 * @param userId - User ID to check
 * @returns true if user is online, false otherwise
 *
 * @example
 * import { isUserOnline } from '@/modules/notifications/utils/notification.utils';
 *
 * const online = isUserOnline(socketIoInstance, userId);
 */
export function isUserOnline(socketIo: any, userId: number): boolean {
  try {
    if (!socketIo || !socketIo.sockets) {
      return false;
    }

    const userRoomName = `user:${userId}`;
    const userRoom = socketIo.sockets.adapter.rooms.get(userRoomName);

    if (userRoom && userRoom.size > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[isUserOnline] Error:', error);
    return false;
  }
}

/**
 * Get NotificationService instance
 * Use this if you need direct access to the service
 *
 * @example
 * import { getNotificationService } from '@/modules/notifications/utils/notification.utils';
 *
 * const service = getNotificationService();
 * await service.createNotification({...});
 */
export function getNotificationService(): NotificationService {
  return notificationService;
}
