/**
 * Message Controller
 * Handles REST API endpoints for sending messages
 * Supports both JSON (with S3 URLs) and multipart (file uploads)
 */

import { Request, Response } from 'express';
import { MessageService, CreateMessageData } from '../services/message.service';
import { ApiResponse } from '../../../resources/ApiResponse';
import { MESSAGE_TYPE, MESSAGE_STATUS, CONVERSATION_TYPE } from '../constants';
import { STORAGE_FOLDERS } from '../../../services/storage';
import { getFileUrlWithStorage } from '../../../utils/file.utils';
import { MessageResource } from '../resources/MessageResource';
import multer from 'multer';
import { SERVER_EVENTS } from '../socket/types';
import { NotificationService } from '../../notifications/services/notification.service';
import { prisma } from '../../../lib/prisma';

// Multer configuration for chat file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, and other files
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('application/') ||
      file.mimetype.startsWith('text/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'));
    }
  },
});

export const uploadChatFile = upload.single('file');

export class MessageController {
  private messageService: MessageService;
  private notificationService: NotificationService;
  private socketIo: any; // Store socket.io instance if available

  constructor(socketIo?: any) {
    this.messageService = new MessageService();
    this.notificationService = new NotificationService(undefined, socketIo);
    this.socketIo = socketIo;
  }

  /**
   * Send Message Endpoint
   * POST /api/v1/mobile/chat/messages
   *
   * Supports two formats:
   * 1. JSON (application/json) - For text messages or messages with S3 URLs
   * 2. Multipart (multipart/form-data) - For file uploads
   */
  sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      // Check if this is a multipart request (file upload)
      const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
      const file = (req as any).file;

      let messageData: CreateMessageData;

      if (isMultipart && file) {
        // Handle file upload
        const {
          conversationId,
          recipientId,
          content,
          messageType,
          replyToId,
          isDisappearing,
          expiresAt,
          sharedPostId,
          sharedClipId,
          sharedUserId,
          sharedLocation,
        } = req.body;

        // Get user UUID for S3 path
        const user = await require('../../../lib/prisma').prisma.user.findUnique({
          where: { id: userId },
          select: { uuid: true },
        });

        if (!user?.uuid) {
          res.status(400).json(ApiResponse.error('User UUID not found', 400));
          return;
        }

        // Determine message type from file if not provided
        let finalMessageType = messageType ? parseInt(messageType) : MESSAGE_TYPE.TEXT;
        if (file.mimetype.startsWith('image/')) {
          finalMessageType = MESSAGE_TYPE.IMAGE;
        } else if (file.mimetype.startsWith('video/')) {
          finalMessageType = MESSAGE_TYPE.VIDEO;
        } else if (file.mimetype.startsWith('audio/')) {
          finalMessageType = MESSAGE_TYPE.AUDIO;
        } else {
          finalMessageType = MESSAGE_TYPE.FILE;
        }

        // Upload file to S3
        const uploadResult = await this.messageService.uploadFileToS3(file, user.uuid!);

        // Store uploaded file info for response
        (req as any).uploadedMedia = [
          {
            mediaUrl: uploadResult.url, // Full S3 URL
            fileName: file.originalname,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType,
            mediaType: file.mimetype.startsWith('image/')
              ? 'image'
              : file.mimetype.startsWith('video/')
                ? 'video'
                : file.mimetype.startsWith('audio/')
                  ? 'audio'
                  : 'file',
          },
        ];

        messageData = {
          conversationId: conversationId ? parseInt(conversationId) : undefined,
          recipientId: recipientId ? parseInt(recipientId) : undefined,
          senderId: userId,
          content: content || null,
          messageType: finalMessageType,
          mediaUrl: uploadResult.url, // Full S3 URL
          mediaStorage: 's3',
          fileName: file.originalname,
          fileSize: uploadResult.size,
          mimeType: uploadResult.mimeType,
          replyToId: replyToId ? parseInt(replyToId) : undefined,
          isDisappearing: isDisappearing === 'true' || isDisappearing === true,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          sharedUserId: sharedUserId ? parseInt(sharedUserId) : undefined,
          sharedLocation: sharedLocation || undefined,
        };
      } else {
        // Handle JSON request (text or S3 URLs in media array)
        const {
          conversationId,
          recipientId,
          content,
          messageType,
          media, // Array of media files (can be any combination)
          replyToId,
          isDisappearing,
          expiresAt,
          sharedPostId,
          sharedClipId,
          sharedUserId,
          sharedLocation,
        } = req.body;

        // Validate media array if provided
        // Support both formats: array of strings (URLs) or array of objects
        let normalizedMedia: any[] = [];
        const hasMedia = media && Array.isArray(media) && media.length > 0;
        if (hasMedia) {
          // Normalize media: convert strings to objects if needed
          normalizedMedia = media
            .map((item: any, index: number) => {
              // If item is a string (URL), convert to object
              if (typeof item === 'string') {
                return {
                  mediaUrl: item,
                  fileName: null,
                  fileSize: null,
                  mimeType: null,
                  mediaType: null,
                  thumbnailUrl: null,
                  duration: null,
                };
              }
              // If item is an object, use as-is
              if (item && typeof item === 'object' && item.mediaUrl) {
                return item;
              }
              // Invalid format
              return null;
            })
            .filter(item => item !== null);

          // Validate normalized media
          if (normalizedMedia.length === 0) {
            res
              .status(400)
              .json(
                ApiResponse.error(
                  'Invalid media format. Media must be an array of URLs (strings) or objects with mediaUrl',
                  400
                )
              );
            return;
          }

          for (const item of normalizedMedia) {
            if (!item.mediaUrl) {
              res.status(400).json(ApiResponse.error('Each media item must have a mediaUrl', 400));
              return;
            }
          }

          // Require messageType when media is provided
          if (!messageType) {
            res
              .status(400)
              .json(ApiResponse.error('Message type is required when media is provided', 400));
            return;
          }
        }

        // Determine message type: use provided, derive from media, or default to TEXT
        let finalMessageType: number;

        if (messageType) {
          // Validate provided message type
          const validMessageTypes = Object.values(MESSAGE_TYPE) as number[];
          if (!validMessageTypes.includes(parseInt(messageType))) {
            res.status(400).json(ApiResponse.error('Invalid message type', 400));
            return;
          }
          finalMessageType = parseInt(messageType);
        } else if (sharedPostId || sharedClipId || sharedUserId || sharedLocation) {
          // Special sharing types - require explicit messageType
          res
            .status(400)
            .json(ApiResponse.error('Message type is required for content sharing messages', 400));
          return;
        } else if (isDisappearing) {
          finalMessageType = MESSAGE_TYPE.DISAPPEARING;
        } else {
          // Default to TEXT
          finalMessageType = MESSAGE_TYPE.TEXT;
        }

        // Validate content or media for TEXT messages
        if (finalMessageType === MESSAGE_TYPE.TEXT && !content && !hasMedia) {
          res.status(400).json(ApiResponse.error('Message content or media is required', 400));
          return;
        }

        // Helper function to extract S3 key from full URL
        const extractS3Key = (url: string | null | undefined): string | null => {
          if (!url) return null;

          // If it's already a key (doesn't start with http), return as-is
          if (!url.startsWith('http')) {
            return url;
          }

          try {
            const urlObj = new URL(url);
            let s3Key = urlObj.pathname;

            // Remove leading slash
            if (s3Key.startsWith('/')) {
              s3Key = s3Key.substring(1);
            }

            return s3Key || null;
          } catch (error) {
            console.error('[Message Controller] Failed to extract S3 key from URL:', url, error);
            // If extraction fails, return original (might be a key already)
            return url;
          }
        };

        // Use first media item for database storage (backward compatibility with existing schema)
        const firstMedia = hasMedia && normalizedMedia.length > 0 ? normalizedMedia[0] : null;

        // Extract S3 keys from media items before passing to service
        const mediaWithKeys =
          hasMedia && normalizedMedia.length > 0
            ? normalizedMedia.map(item => ({
                ...item,
                mediaUrl: extractS3Key(item.mediaUrl) || item.mediaUrl,
                thumbnailUrl: item.thumbnailUrl
                  ? extractS3Key(item.thumbnailUrl) || item.thumbnailUrl
                  : undefined,
              }))
            : undefined;

        messageData = {
          conversationId: conversationId ? parseInt(conversationId) : undefined,
          recipientId: recipientId ? parseInt(recipientId) : undefined,
          senderId: userId,
          content: content || null,
          messageType: finalMessageType,
          media: mediaWithKeys, // Pass media with extracted S3 keys
          mediaUrl: firstMedia?.mediaUrl || undefined,
          mediaStorage: firstMedia?.mediaUrl ? 's3' : undefined,
          thumbnailUrl: firstMedia?.thumbnailUrl || undefined,
          fileName: firstMedia?.fileName || undefined,
          fileSize: firstMedia?.fileSize ? parseInt(firstMedia.fileSize.toString()) : undefined,
          mimeType: firstMedia?.mimeType || undefined,
          replyToId: replyToId ? parseInt(replyToId) : undefined,
          isDisappearing: isDisappearing || false,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          sharedUserId: sharedUserId ? parseInt(sharedUserId) : undefined,
          sharedLocation: sharedLocation || undefined,
        };
      }

      // Validate message data
      const validation = await this.messageService.validateMessageData(messageData);
      if (!validation.valid) {
        res.status(400).json(ApiResponse.error(validation.error || 'Invalid message data', 400));
        return;
      }

      // Create message
      const message = await this.messageService.createMessage(messageData);

      // Load message with media for transformation
      const messageWithMedia = await require('../../../lib/prisma').prisma.message.findUnique({
        where: { id: message.id },
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
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  userName: true,
                },
              },
            },
          },
          reactions: {
            select: {
              id: true,
              userId: true,
              emoji: true,
              createdAt: true,
            },
          },
          readReceipts: {
            select: {
              id: true,
              userId: true,
              readAt: true,
            },
          },
          sharedUser: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
              profession: true,
            },
          },
          media: {
            orderBy: {
              order: 'asc',
            },
          },
        },
      });

      // Transform message using MessageResource (includes media array)
      const transformedMessage = await MessageResource.transform(
        messageWithMedia || message,
        userId
      );

      // Prepare response
      const response: any = {
        ...transformedMessage,
        createdAt: transformedMessage.createdAt?.toISOString() || message.createdAt.toISOString(),
        updatedAt: transformedMessage.updatedAt?.toISOString() || message.updatedAt.toISOString(),
        expiresAt: transformedMessage.expiresAt?.toISOString() || null,
      };

      // Broadcast via socket if available
      if (this.socketIo) {
        const messageResponse = {
          message: response,
          conversationId: message.conversationId,
        };
        const roomName = `conversation:${message.conversationId}`;
        this.socketIo.to(roomName).emit(SERVER_EVENTS.MESSAGE_RECEIVED, messageResponse);
      }

      // Send push notifications to offline recipients
      const prisma = require('../../../lib/prisma').prisma;
      const conversation = await prisma.conversation.findUnique({
        where: { id: message.conversationId },
      });

      if (conversation) {
        // Get all participants except sender
        // IMPORTANT: Include participants even if they have deletedAt set (for notifications)
        // We want to notify all participants, regardless of who deleted the chat
        // Even if A deleted the conversation, when B sends a message, A should receive a notification
        // The conversation will be restored for A (deletedAt set to null) in messageService.createMessage
        // But we still need to send the notification, so we don't filter by deletedAt here
        const participants = await prisma.conversationParticipant.findMany({
          where: {
            conversationId: message.conversationId,
            userId: { not: userId },
            // Don't filter by deletedAt - we want to notify all participants
            // This ensures notifications are sent to participants who deleted the conversation
            // Even if one user deleted the chat, they should still receive notifications
          },
          select: {
            userId: true,
          },
        });

        // Send notifications to offline users or users not in conversation room
        for (const participant of participants) {
          let isOnline = false;
          let isInConversationRoom = false;

          // Check if user is online via socket
          if (this.socketIo) {
            const userRoomName = `user:${participant.userId}`;
            const userRoom = this.socketIo.sockets.adapter.rooms.get(userRoomName);
            if (userRoom && userRoom.size > 0) {
              isOnline = true;
            }

            // For direct conversations, also check if user is in conversation room
            if (conversation.type === CONVERSATION_TYPE.DIRECT && isOnline) {
              const conversationRoomName = `conversation:${conversation.id}`;
              const conversationRoom =
                this.socketIo.sockets.adapter.rooms.get(conversationRoomName);
              if (conversationRoom && conversationRoom.size > 1) {
                // Check if this participant is in the room
                // We need to check if any socket in the room belongs to this user
                for (const socketId of conversationRoom) {
                  const socket = this.socketIo.sockets.sockets.get(socketId);
                  if (socket && (socket as any).userId === participant.userId) {
                    isInConversationRoom = true;
                    break;
                  }
                }
              }
            }
          }

          // Send notification only if:
          // 1. User is offline, OR
          // 2. User is online but not in conversation room (for direct messages)
          // If user is in conversation room, they'll receive via Socket.IO (no notification needed)
          const shouldSendNotification =
            !isOnline || (conversation.type === CONVERSATION_TYPE.DIRECT && !isInConversationRoom);

          if (shouldSendNotification) {
            // Pass false for isRecipientOnline since we've already determined notification should be sent
            // (user is offline OR online but not in conversation room)
            this.notificationService
              .sendMessageNotification(
                participant.userId,
                userId,
                messageWithMedia || message,
                conversation,
                false // Always pass false since we've already checked if notification should be sent
              )
              .catch((error: any) => {
                console.error(`[MessageController] Error sending push notification:`, error);
              });
          }
        }
      }

      res.status(201).json(ApiResponse.success(response, 'Message sent successfully'));
    } catch (error) {
      console.error('[MessageController] Error sending message:', error);
      res.status(500).json(ApiResponse.serverError('Failed to send message'));
    }
  };

  /**
   * Get Messages Endpoint
   * GET /api/v1/mobile/chat/conversations/:conversationId/messages
   *
   * Supports both offset-based and cursor-based pagination
   */
  getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.conversationId)
        ? req.params.conversationId[0]
        : req.params.conversationId;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      // Parse query parameters
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const before = req.query.before ? parseInt(req.query.before as string) : undefined;
      const after = req.query.after ? parseInt(req.query.after as string) : undefined;
      const messageType = req.query.messageType
        ? parseInt(req.query.messageType as string)
        : undefined;
      const search = req.query.search as string | undefined;
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const includeDeleted = req.query.includeDeleted === 'true';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

      // Validate pagination parameters
      if (page !== undefined && (isNaN(page) || page < 1)) {
        res.status(400).json(ApiResponse.error('Page must be a positive integer', 400));
        return;
      }

      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
        res.status(400).json(ApiResponse.error('Limit must be between 1 and 100', 400));
        return;
      }

      if (before !== undefined && isNaN(before)) {
        res.status(400).json(ApiResponse.error('Before must be a valid message ID', 400));
        return;
      }

      if (after !== undefined && isNaN(after)) {
        res.status(400).json(ApiResponse.error('After must be a valid message ID', 400));
        return;
      }

      if (sortOrder !== 'asc' && sortOrder !== 'desc') {
        res.status(400).json(ApiResponse.error('Sort order must be "asc" or "desc"', 400));
        return;
      }

      // Get messages
      const result = await this.messageService.getMessages(conversationId, userId, {
        page,
        limit,
        before,
        after,
        messageType,
        search,
        fromDate,
        toDate,
        includeDeleted,
        sortOrder,
      });

      // Mark messages as delivered when fetched (user is receiving them)
      // Only for direct conversations
      if (result.conversation?.type === CONVERSATION_TYPE.DIRECT) {
        // Get the other participant (sender)
        const otherParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: { not: userId },
            deletedAt: null,
          },
          select: {
            userId: true,
          },
        });

        if (otherParticipant) {
          // Get message IDs that were fetched (only SENT messages from the other participant)
          const fetchedMessageIds = result.messages
            .filter(
              (msg: any) =>
                msg.senderId === otherParticipant.userId && msg.status === MESSAGE_STATUS.SENT
            )
            .map((msg: any) => msg.id);

          if (fetchedMessageIds.length > 0) {
            // Mark as delivered
            await prisma.message.updateMany({
              where: {
                id: { in: fetchedMessageIds },
                conversationId,
                senderId: otherParticipant.userId,
                status: MESSAGE_STATUS.SENT,
              },
              data: {
                status: MESSAGE_STATUS.DELIVERED,
              },
            });

            // Notify sender via Socket.IO if available
            if (this.socketIo) {
              for (const messageId of fetchedMessageIds) {
                this.socketIo
                  .to(`user:${otherParticipant.userId}`)
                  .emit(SERVER_EVENTS.MESSAGE_DELIVERED, {
                    messageId,
                    conversationId,
                  });
              }
            }
          }
        }
      }

      // Transform messages using MessageResource
      const transformedMessages = await MessageResource.collection(result.messages, userId);

      // Build response
      const response = {
        messages: transformedMessages,
        pagination: result.pagination,
        conversation: result.conversation,
      };

      res.status(200).json(ApiResponse.success(response, 'Messages retrieved successfully'));
    } catch (error: any) {
      console.error('[MessageController] Error getting messages:', error);
      console.error('[MessageController] Error stack:', error.stack);

      if (error.message === 'You are not a participant in this conversation') {
        res.status(403).json(ApiResponse.error(error.message, 403));
        return;
      }

      if (error.message === 'Conversation not found') {
        res.status(404).json(ApiResponse.error(error.message, 404));
        return;
      }

      res.status(500).json(ApiResponse.serverError('Failed to retrieve messages'));
    }
  };
}
