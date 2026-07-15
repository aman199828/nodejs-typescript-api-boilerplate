/**
 * Socket Event Handlers Implementation
 * Contains all business logic for socket events
 */

import { AuthenticatedSocket } from './types';
import {
  JoinConversationPayload,
  LeaveConversationPayload,
  SendMessagePayload,
  MarkReadPayload,
  TypingStartPayload,
  TypingStopPayload,
  ReactToMessagePayload,
  RemoveReactionPayload,
  AcceptMessageRequestPayload,
  DeclineMessageRequestPayload,
  CreateGroupChatPayload,
  AddParticipantsPayload,
  RemoveParticipantPayload,
  LeaveGroupPayload,
  UpdateGroupSettingsPayload,
  EditMessagePayload,
  DeleteMessagePayload,
  ViewDisappearingMessagePayload,
} from './types';
import { RoomManager } from './rooms';
import { prisma } from '../../../lib/prisma';
import {
  MESSAGE_STATUS,
  MESSAGE_TYPE,
  CONVERSATION_TYPE,
  PARTICIPANT_ROLE,
  MESSAGE_REQUEST_STATUS,
} from '../constants';
import { CALL_TYPE } from '../constants/call.constants';
import { SERVER_EVENTS, CLIENT_EVENTS } from './types';
import { emitError } from './auth.middleware';
import { MessageResource } from '../resources/MessageResource';
import { NotificationService } from '../../notifications/services/notification.service';
import { callStatusService } from '../services/call-status.service';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import {
  CallStartedPayload,
  CallEndedPayload,
  CheckCallStatusPayload,
  UserCallStatusResponse,
  UserStatusPayload,
} from './types';

export class SocketHandlers {
  private roomManager: RoomManager;
  private notificationService: NotificationService;
  private conversationService: ConversationService;
  private messageService: MessageService;
  private io: any; // Socket.IO server instance

  constructor(roomManager: RoomManager, io?: any) {
    this.roomManager = roomManager;
    this.io = io;
    this.notificationService = new NotificationService(undefined, io);
    this.conversationService = new ConversationService();
    this.messageService = new MessageService();
  }

  /**
   * Mark messages as delivered when recipient actually receives them
   * Called when message is received via Socket.IO or REST API
   */
  async markMessagesAsDelivered(
    conversationId: number,
    recipientId: number,
    messageIds?: number[]
  ): Promise<void> {
    try {
      // Get the other participant (sender)
      const otherParticipant = await prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          userId: { not: recipientId },
          deletedAt: null,
        },
        select: {
          userId: true,
        },
      });

      if (!otherParticipant) return;

      // Build where clause
      const where: any = {
        conversationId,
        senderId: otherParticipant.userId,
        status: MESSAGE_STATUS.SENT, // Only update SENT messages
      };

      // If specific message IDs provided, only update those
      if (messageIds && messageIds.length > 0) {
        where.id = { in: messageIds };
      }

      // Update messages to DELIVERED
      const updatedMessages = await prisma.message.updateMany({
        where,
        data: {
          status: MESSAGE_STATUS.DELIVERED,
        },
      });

      // Notify sender about delivered messages
      if (updatedMessages.count > 0) {
        const deliveredMessages = await prisma.message.findMany({
          where: {
            ...where,
            status: MESSAGE_STATUS.DELIVERED,
            readAt: null, // Only messages not yet read
          },
          select: {
            id: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50, // Limit to recent messages
        });

        // Notify sender about each delivered message
        for (const msg of deliveredMessages) {
          this.roomManager.broadcastToUser(
            otherParticipant.userId,
            SERVER_EVENTS.MESSAGE_DELIVERED,
            {
              messageId: msg.id,
              conversationId,
            }
          );
        }
      }
    } catch (error) {
      console.error('[Socket] Error marking messages as delivered:', error);
    }
  }

  /**
   * Join Conversation Handler
   */
  async handleJoinConversation(
    socket: AuthenticatedSocket,
    payload: JoinConversationPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId } = payload;

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }
      // Allow joining even if deletedAt is set - user can still participate in real-time events
      // (typing indicators, online status, etc.) even after clearing chat history

      // Join conversation room
      this.roomManager.joinConversation(socket, conversationId);

      // Mark pending messages as delivered (user joined conversation, so they can receive messages)
      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT) {
        // User joined conversation - mark all pending SENT messages as DELIVERED
        // They will receive these messages via Socket.IO now that they're in the room
        await this.markMessagesAsDelivered(conversationId, userId);
      }

      console.log(`[Socket] User ${userId} joined conversation ${conversationId}`);
    } catch (error) {
      console.error('[Socket] Error joining conversation:', error);
      emitError(socket, 'Failed to join conversation', 'JOIN_ERROR');
    }
  }

  /**
   * Leave Conversation Handler
   */
  async handleLeaveConversation(
    socket: AuthenticatedSocket,
    payload: LeaveConversationPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId } = payload;

      // Leave conversation room
      this.roomManager.leaveConversation(socket, conversationId);

      console.log(`[Socket] User ${userId} left conversation ${conversationId}`);
    } catch (error) {
      console.error('[Socket] Error leaving conversation:', error);
      emitError(socket, 'Failed to leave conversation', 'LEAVE_ERROR');
    }
  }

  /**
   * Send Message Handler
   */
  async handleSendMessage(socket: AuthenticatedSocket, payload: SendMessagePayload): Promise<void> {
    try {
      const { userId, user } = socket;
      if (!userId || !user) throw new Error('User not authenticated');

      const {
        conversationId: providedConversationId,
        recipientId,
        content,
        messageType: rawMessageType,
        media, // Array of media files (can be any combination)
        replyToId,
        storyId,
        isDisappearing,
        expiresAt,
        sharedPostId,
        sharedClipId,
        sharedUserId,
        sharedLocation,
        uuid, // NEW: Client-provided UUID for deduplication
        message_time, // NEW: UTC timestamp from client
      } = payload;

      // Ensure messageType is an integer
      const messageType =
        rawMessageType !== undefined ? parseInt(String(rawMessageType), 10) : undefined;
      if (
        rawMessageType !== undefined &&
        (isNaN(messageType!) || !Number.isInteger(messageType!))
      ) {
        emitError(socket, 'Message type must be a valid integer', 'INVALID_MESSAGE_TYPE');
        return;
      }

      // Auto-create conversation if recipientId is provided but conversationId is not
      let conversationId: number;
      if (!providedConversationId && recipientId) {
        // Validate recipient exists
        const recipient = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { id: true, isActive: true },
        });

        if (!recipient || !recipient.isActive) {
          emitError(socket, 'Recipient user not found or inactive', 'RECIPIENT_NOT_FOUND');
          return;
        }

        // Find or create direct conversation
        const conversation = await this.conversationService.findOrCreateDirectConversation(
          userId,
          recipientId
        );
        conversationId = conversation.id;

        console.log(
          `[Socket] Auto-created conversation ${conversationId} for users ${userId} and ${recipientId}`
        );
      } else if (providedConversationId) {
        conversationId = providedConversationId;
      } else {
        emitError(
          socket,
          'Either conversationId or recipientId is required',
          'MISSING_CONVERSATION_OR_RECIPIENT'
        );
        return;
      }

      console.log(
        `[Socket] handleSendMessage called - userId: ${userId}, conversationId: ${conversationId}`
      );

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }
      // Allow sending messages even if user deleted the conversation (deletedAt is set)
      // deletedAt only affects message visibility, not the ability to send messages
      // Users should be able to send messages even after clearing chat history

      // Validate UUID format (if provided)
      if (uuid) {
        // Validate format: 12 characters with hyphen (xxxxxxxx-xxxx)
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}$/i;
        if (!uuidRegex.test(uuid)) {
          emitError(
            socket,
            'Invalid UUID format. Must be in format: xxxxxxxx-xxxx',
            'INVALID_UUID'
          );
          return;
        }

        // Check for duplicate UUID
        const existingMessage = await prisma.message.findUnique({
          where: { uuid },
          select: { id: true, conversationId: true, senderId: true },
        });

        if (existingMessage) {
          // Return existing message instead of creating duplicate
          // Fetch full message and send response
          const fullMessage = await this.messageService.getMessageById(existingMessage.id, userId);
          socket.emit(SERVER_EVENTS.MESSAGE_SENT, {
            message: fullMessage,
            conversationId: existingMessage.conversationId,
          });
          console.log(
            `[Socket] Duplicate UUID detected - returning existing message ${existingMessage.id}`
          );
          return;
        }
      }

      // Validate and parse message_time (if provided)
      let messageTime: Date | null = null;
      if (message_time) {
        try {
          messageTime = new Date(message_time);
          if (isNaN(messageTime.getTime())) {
            emitError(
              socket,
              'Invalid message_time format. Must be ISO8601 UTC format',
              'INVALID_TIMESTAMP'
            );
            return;
          }
          // Verify it's in UTC format (ISO8601 ends with Z or has +00:00)
          if (!message_time.endsWith('Z') && !message_time.includes('+00:00')) {
            emitError(
              socket,
              'message_time must be in UTC format (ISO8601 with Z suffix)',
              'INVALID_TIMESTAMP'
            );
            return;
          }
        } catch (error) {
          emitError(socket, 'Invalid message_time format', 'INVALID_TIMESTAMP');
          return;
        }
      } else {
        // Fallback to current time if not provided (backward compatibility)
        messageTime = new Date();
      }

      // Generate UUID if not provided (backward compatibility)
      let messageUuid = uuid;
      if (!messageUuid) {
        // Generate 12-character UUID format: xxxxxxxx-xxxx
        const part1 = Math.random().toString(36).substring(2, 10).padEnd(8, '0');
        const part2 = Math.random().toString(36).substring(2, 6).padEnd(4, '0');
        messageUuid = `${part1}-${part2}`;
        console.log(`[Socket] Generated UUID for message: ${messageUuid}`);
      }

      // Validate media array if provided
      // Support both formats: array of strings (URLs) or array of objects
      let normalizedMedia: any[] = [];
      const hasMedia = media && media.length > 0;
      if (hasMedia) {
        // Helper function to derive mediaType from URL extension
        const deriveMediaTypeFromUrl = (url: string): string | null => {
          try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.toLowerCase();
            const extension = pathname.split('.').pop()?.split('?')[0]; // Remove query params

            if (!extension) return null;

            // Image extensions
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(extension)) {
              return 'image';
            }
            // Video extensions
            if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv', 'm4v'].includes(extension)) {
              return 'video';
            }
            // Audio extensions
            if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma'].includes(extension)) {
              return 'audio';
            }
            // Default to 'file' for other extensions
            return 'file';
          } catch (e) {
            return null;
          }
        };

        // Normalize media: convert strings to objects if needed
        normalizedMedia = media
          .map((item: any, index: number) => {
            // If item is a string (URL), convert to object
            if (typeof item === 'string') {
              const derivedMediaType = deriveMediaTypeFromUrl(item);
              return {
                mediaUrl: item,
                fileName: null,
                fileSize: null,
                mimeType: null,
                mediaType: derivedMediaType, // Derive from URL extension
                thumbnailUrl: null,
                duration: null,
              };
            }
            // If item is an object, use as-is (but derive mediaType if missing)
            if (item && typeof item === 'object' && item.mediaUrl) {
              // If mediaType is not provided, try to derive it
              if (!item.mediaType && item.mediaUrl) {
                const derivedMediaType = deriveMediaTypeFromUrl(item.mediaUrl);
                return {
                  ...item,
                  mediaType: derivedMediaType || item.mediaType || null,
                };
              }
              return item;
            }
            // Invalid format
            return null;
          })
          .filter(item => item !== null);

        // Validate normalized media
        if (normalizedMedia.length === 0) {
          emitError(
            socket,
            'Invalid media format. Media must be an array of URLs (strings) or objects with mediaUrl',
            'INVALID_MEDIA'
          );
          return;
        }

        for (const item of normalizedMedia) {
          if (!item.mediaUrl) {
            emitError(socket, 'Each media item must have a mediaUrl', 'INVALID_MEDIA');
            return;
          }
        }

        // Require messageType when media is provided
        if (!messageType) {
          emitError(
            socket,
            'Message type is required when media is provided',
            'MISSING_MESSAGE_TYPE'
          );
          return;
        }
      }

      // Determine message type: use provided, derive from media, or default to TEXT
      let finalMessageType: number;

      if (messageType) {
        // Validate provided message type
        const validMessageTypes = Object.values(MESSAGE_TYPE) as number[];
        if (!validMessageTypes.includes(messageType)) {
          emitError(socket, 'Invalid message type', 'INVALID_MESSAGE_TYPE');
          return;
        }
        finalMessageType = messageType;
      } else if (sharedPostId || sharedClipId || sharedUserId || sharedLocation) {
        // Special sharing types - require explicit messageType
        emitError(
          socket,
          'Message type is required for content sharing messages',
          'MISSING_MESSAGE_TYPE'
        );
        return;
      } else if (storyId) {
        finalMessageType = MESSAGE_TYPE.STORY_REPLY;
      } else if (isDisappearing) {
        finalMessageType = MESSAGE_TYPE.DISAPPEARING;
      } else {
        // Default to TEXT
        finalMessageType = MESSAGE_TYPE.TEXT;
      }

      // Validate content or media for TEXT messages
      if (finalMessageType === MESSAGE_TYPE.TEXT && !content && !hasMedia) {
        emitError(socket, 'Message content or media is required', 'MISSING_CONTENT');
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
          console.error('[Socket Handler] Failed to extract S3 key from URL:', url, error);
          // If extraction fails, return original (might be a key already)
          return url;
        }
      };

      // Use first media item for database storage (backward compatibility with existing schema)
      const firstMedia = hasMedia && normalizedMedia.length > 0 ? normalizedMedia[0] : null;
      const finalMediaUrl = extractS3Key(firstMedia?.mediaUrl || null); // Store only S3 key
      const finalThumbnailUrl = extractS3Key(firstMedia?.thumbnailUrl || null); // Store only S3 key
      const finalFileName = firstMedia?.fileName || null;
      const finalFileSize = firstMedia?.fileSize || null;
      const finalMimeType = firstMedia?.mimeType || null;

      // Validate reply exists if replyToId provided
      if (replyToId) {
        const replyToMessage = await prisma.message.findUnique({
          where: { id: replyToId },
        });
        if (!replyToMessage || replyToMessage.conversationId !== conversationId) {
          emitError(socket, 'Reply message not found', 'REPLY_NOT_FOUND');
          return;
        }
      }

      // Calculate expiresAt for disappearing messages
      let messageExpiresAt: Date | null = null;
      if (isDisappearing) {
        if (expiresAt) {
          messageExpiresAt = new Date(expiresAt);
        } else {
          // Default: 24 hours from now
          messageExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
      }

      // Create message in database
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: content || null,
          messageType: finalMessageType,
          mediaUrl: finalMediaUrl,
          mediaStorage: finalMediaUrl ? 's3' : null,
          thumbnailUrl: finalThumbnailUrl,
          fileSize: finalFileSize,
          fileName: finalFileName,
          mimeType: finalMimeType,
          replyToId: replyToId || null,
          storyId: storyId || null,
          sharedPostId: sharedPostId || null,
          sharedClipId: sharedClipId || null,
          sharedUserId: sharedUserId || null,
          sharedLocation: sharedLocation || null,
          status: MESSAGE_STATUS.SENT,
          isDisappearing: isDisappearing || false,
          expiresAt: messageExpiresAt,
          uuid: messageUuid, // NEW: Client-provided or server-generated UUID
          message_time: messageTime, // NEW: UTC timestamp from client or current time
          createdAt: messageTime, // Use message_time for createdAt too
        } as any,
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

      // Create MessageMedia records if media array is provided
      // Use the extractS3Key function defined earlier in the function scope
      if (hasMedia && normalizedMedia.length > 0) {
        // Filter out items with null mediaUrl and map to create records
        const mediaRecords = normalizedMedia
          .map((item, index) => {
            const extractedKey = extractS3Key(item.mediaUrl);
            // Only include items with valid mediaUrl
            if (!extractedKey) {
              console.warn(
                `[Socket Handler] Skipping media item at index ${index} - invalid mediaUrl`
              );
              return null;
            }
            return {
              messageId: message.id,
              mediaUrl: extractedKey, // Store only S3 key, not full URL
              mediaStorage: 's3' as const,
              thumbnailUrl: extractS3Key(item.thumbnailUrl || null), // Store only S3 key
              fileName: item.fileName || null,
              fileSize: item.fileSize || null,
              mimeType: item.mimeType || null,
              mediaType: item.mediaType || null,
              duration: item.duration || null,
              order: index,
            };
          })
          .filter((record): record is NonNullable<typeof record> => record !== null);

        // Only create records if we have valid media items
        if (mediaRecords.length > 0) {
          await prisma.messageMedia.createMany({
            data: mediaRecords,
          });
        }
      }

      // Reload message with media
      const messageWithMedia = await prisma.message.findUnique({
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

      // Use message with media for transformation
      if (messageWithMedia) {
        // Preserve message_time from database before Object.assign (database value takes priority)
        const dbMessageTime = (messageWithMedia as any).message_time;
        const preservedMessageTime = dbMessageTime || messageTime || message.createdAt;

        Object.assign(message, messageWithMedia);

        // Ensure messageType is preserved (defensive check)
        if (!message.messageType && finalMessageType !== undefined) {
          message.messageType = finalMessageType;
        }
        // Always set message_time from database (it should be there, but ensure it)
        (message as any).message_time = dbMessageTime || preservedMessageTime;

        // Debug log to verify message_time is retrieved from database
        console.log(
          `[Socket] Message ${message.id} - message_time from DB:`,
          dbMessageTime,
          'set on message:',
          (message as any).message_time
        );
      } else {
        // If messageWithMedia is null, ensure message_time is set on original message
        if (!(message as any).message_time) {
          (message as any).message_time = messageTime || message.createdAt;
        }
        console.log(
          `[Socket] Message ${message.id} - message_time (no reload):`,
          (message as any).message_time
        );
      }

      // Update conversation last message
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageId: message.id,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // IMPORTANT: Do NOT clear deletedAt when sender sends a message
      // The deletedAt timestamp is used to filter old messages - we want to keep it
      // User can send/receive new messages, but old messages (before deletion) remain hidden

      // Check conversation and participant deletion status
      const conversationCheck = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          deletedAt: true,
          type: true,
        },
      });

      const allParticipants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { deletedAt: true },
      });

      // For direct conversations: if all participants have deleted, mark conversation as deleted
      if (conversationCheck?.type === CONVERSATION_TYPE.DIRECT) {
        // Count how many participants have deleted
        const deletedCount = allParticipants.filter(p => p.deletedAt !== null).length;
        const totalCount = allParticipants.length;
        const allDeleted = totalCount > 0 && deletedCount === totalCount;

        if (allDeleted && !conversationCheck.deletedAt) {
          // All participants deleted but conversation not marked - fix it
          console.log(
            `[Socket] All ${totalCount} participants deleted conversation ${conversationId}, marking conversation as deleted`
          );
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              deletedAt: new Date(),
            },
          });
        } else if (!allDeleted && conversationCheck.deletedAt) {
          // At least one participant is active - restore the conversation
          // But keep participant deletedAt timestamps for message filtering
          console.log(
            `[Socket] Conversation ${conversationId} was deleted but ${totalCount - deletedCount} participant(s) are active, restoring conversation`
          );
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              deletedAt: null,
            },
          });
        }
      }

      // Find participants who deleted the conversation (we still want to increment their unread count)
      const deletedParticipants = await prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          userId: { not: userId },
          deletedAt: { not: null }, // Participants who deleted
        },
        select: {
          userId: true,
        },
      });

      // Increment unread count for participants who deleted (but don't restore the conversation)
      // They will see the conversation in their listing and can see new messages
      if (deletedParticipants.length > 0) {
        const deletedUserIds = deletedParticipants.map((p: { userId: number }) => p.userId);

        await prisma.conversationParticipant.updateMany({
          where: {
            conversationId,
            userId: { in: deletedUserIds },
          },
          data: {
            // Keep deletedAt set - don't restore
            // Just increment unread count so they know there's a new message
            unreadCount: {
              increment: 1,
            },
          },
        });
      }

      // Increment unread count for participants who didn't delete
      const deletedUserIds =
        deletedParticipants.length > 0
          ? deletedParticipants.map((p: { userId: number }) => p.userId)
          : [];

      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId,
          userId: {
            not: userId,
            ...(deletedUserIds.length > 0 ? { notIn: deletedUserIds } : {}),
          },
          deletedAt: null, // Only non-deleted participants
        },
        data: {
          unreadCount: {
            increment: 1,
          },
        },
      });

      // Transform message using MessageResource to generate presigned URLs (includes media array)
      const transformedMessage = await MessageResource.transform(message, userId);

      // Ensure messageType is included (defensive check)
      if (!transformedMessage.messageType && finalMessageType !== undefined) {
        transformedMessage.messageType = finalMessageType;
      }

      // Ensure message_time is included (defensive check - prioritize database value)
      // Get message_time from multiple sources to ensure we have it
      const messageTimeFromDb = (message as any).message_time;
      const messageTimeFromOriginal = messageTime;
      const messageTimeFallback = message.createdAt;

      // Always set message_time explicitly (prioritize database value)
      if (!transformedMessage.message_time) {
        transformedMessage.message_time =
          messageTimeFromDb || messageTimeFromOriginal || messageTimeFallback;
      } else {
        // Ensure it's valid - if not, replace it
        if (
          !(transformedMessage.message_time instanceof Date) &&
          typeof transformedMessage.message_time !== 'string' &&
          transformedMessage.message_time !== null
        ) {
          transformedMessage.message_time =
            messageTimeFromDb || messageTimeFromOriginal || messageTimeFallback;
        }
      }

      // Debug log to verify message_time is included
      console.log(
        `[Socket] Message ${message.id} - message_time in transformed:`,
        transformedMessage.message_time,
        'from DB:',
        messageTimeFromDb
      );

      // Prepare message response
      const messageResponse = {
        message: transformedMessage,
      };

      // Emit to sender (confirmation)
      // Include conversationId, uuid, message_time, and messageType so client can cache it for future messages
      const messageTimeForResponse =
        transformedMessage.message_time ||
        messageTimeFromDb ||
        messageTimeFromOriginal ||
        messageTimeFallback;
      socket.emit(SERVER_EVENTS.MESSAGE_SENT, {
        messageId: message.id,
        uuid: message.uuid || messageUuid, // NEW: Echo back UUID for client deduplication (use generated if null)
        conversationId: conversationId,
        status: MESSAGE_STATUS.SENT,
        message_time: messageTimeForResponse, // NEW: Include message_time
        messageType: transformedMessage.messageType || finalMessageType, // NEW: Include messageType
      });

      // Check if recipient is in conversation room before broadcasting
      let isRecipientInRoom = false;
      let otherParticipant: { userId: number } | null = null;

      console.log(
        `[Socket] Message sent - conversationId: ${conversationId}, type: ${participant.conversation.type}, senderId: ${userId}`
      );

      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT) {
        console.log(`[Socket] Direct conversation detected, finding other participant...`);
        // Get other participant - include even if they have deletedAt set
        // IMPORTANT: We want to notify them regardless of whether they deleted the chat
        // Even if A deleted the conversation, when B sends a message, A should receive a notification
        // The conversation will be restored for A (deletedAt set to null) in messageService.createMessage
        // But we still need to send the notification, so we don't filter by deletedAt here
        otherParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: { not: userId },
            // Don't filter by deletedAt - we want to notify even if they deleted
            // This ensures notifications are sent to participants who deleted the conversation
          },
          select: {
            userId: true,
          },
        });

        if (otherParticipant) {
          // Check if recipient is actually in the conversation room (can receive via Socket.IO)
          // We need to check if any of the recipient's sockets are in the conversation room
          const recipientSockets = this.roomManager.getUserSockets(otherParticipant.userId);
          const conversationSockets = this.roomManager.getConversationSockets(conversationId);

          // Check if any of the recipient's sockets are in the conversation room
          isRecipientInRoom = Array.from(recipientSockets).some(socketId =>
            conversationSockets.has(socketId)
          );

          const isRecipientOnline = this.roomManager.isUserOnline(otherParticipant.userId);

          console.log(
            `[Socket] Recipient found: userId=${otherParticipant.userId}, online=${isRecipientOnline}, inRoom=${isRecipientInRoom}, messageId=${message.id}`
          );
          console.log(
            `[Socket] Notification service initialized: ${!!this.notificationService}, Socket.IO instance: ${!!this.io}`
          );

          // ALWAYS send notification (both socket notification and push notification)
          // Socket notification is for real-time updates in the app (even if user is in conversation room)
          // Push notification (FCM) is for when the app is closed or user is offline
          // NOTE: This applies even if the recipient deleted the conversation - they should still be notified
          // The notification service will handle sending both socket and push notifications
          // FCM push notification will be sent even if user is offline
          try {
            await this.notificationService.sendMessageNotification(
              otherParticipant.userId,
              userId,
              message,
              participant.conversation,
              isRecipientOnline && isRecipientInRoom // Pass true if user is online and in room (for logging)
            );
            console.log(
              `[Socket] ✅ Notification sent successfully to user ${otherParticipant.userId} (online: ${isRecipientOnline}, inRoom: ${isRecipientInRoom})`
            );
          } catch (error) {
            console.error(
              `[Socket] ❌ Error sending notification to user ${otherParticipant.userId}:`,
              error
            );
            // Don't fail message sending if notification fails - log error and continue
          }
        } else {
          console.error(
            `[Socket] ❌ CRITICAL: No other participant found for conversation ${conversationId}, skipping notification`
          );
          // This should never happen - if it does, we need to investigate why participant is missing
        }
      }

      // Broadcast to conversation room (excluding sender)
      // If recipient is in room, they will receive this via Socket.IO
      const conversationRoomName = `conversation:${conversationId}`;
      const conversationRoomSockets = this.roomManager.getConversationSockets(conversationId);
      const recipientSocketsInRoom = Array.from(conversationRoomSockets).filter(socketId => {
        const recipientSocket = this.roomManager.getSocketById(socketId);
        return recipientSocket?.userId === otherParticipant?.userId;
      });

      this.roomManager.broadcastToConversation(
        conversationId,
        SERVER_EVENTS.MESSAGE_RECEIVED,
        messageResponse,
        socket.id
      );

      console.log(
        `[Socket] 📨 Message ${message.id} sent to conversation room "${conversationRoomName}" (${conversationRoomSockets.size} sockets in room, recipient ${otherParticipant?.userId} has ${recipientSocketsInRoom.length} socket(s) in room)`
      );

      // ALSO send directly to recipient's presence room as fallback
      // This ensures messages are delivered even if recipient hasn't joined conversation room
      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT && otherParticipant) {
        // Send message directly to recipient's presence room (all their devices)
        // This ensures delivery even if they're not in conversation room
        const recipientPresenceRoomName = `user:${otherParticipant.userId}`;
        const recipientPresenceSockets = this.roomManager.getUserSockets(otherParticipant.userId);

        this.roomManager.broadcastToUser(
          otherParticipant.userId,
          SERVER_EVENTS.MESSAGE_RECEIVED,
          messageResponse
        );

        console.log(
          `[Socket] 📨 Message ${message.id} ALSO sent to recipient ${otherParticipant.userId} presence room "${recipientPresenceRoomName}" (${recipientPresenceSockets.size} socket(s) total) - FALLBACK DELIVERY`
        );
        console.log(
          `[Socket] 📨 Message delivery summary: Conversation room=${conversationRoomSockets.size} sockets, Presence room=${recipientPresenceSockets.size} sockets, Recipient in conversation room=${recipientSocketsInRoom.length > 0 ? 'YES' : 'NO'}`
        );
      }

      // Mark as delivered if recipient is in conversation room (actually received it)
      if (
        participant.conversation.type === CONVERSATION_TYPE.DIRECT &&
        otherParticipant &&
        isRecipientInRoom
      ) {
        await this.markMessagesAsDelivered(conversationId, otherParticipant.userId, [message.id]);
      }
      // If recipient not in room, status stays SENT (will be marked delivered when they fetch messages or join)

      if (participant.conversation.type !== CONVERSATION_TYPE.DIRECT) {
        // For group messages, send notifications to all offline participants
        // Include participants even if they have deletedAt set (for notifications)
        const allParticipants = await prisma.conversationParticipant.findMany({
          where: {
            conversationId,
            userId: { not: userId }, // Exclude sender
            // Don't filter by deletedAt - we want to notify all participants
          },
          select: {
            userId: true,
          },
        });

        // Send notifications to offline participants asynchronously
        // Reload conversation for notification service
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });

        if (conversation) {
          for (const participant of allParticipants) {
            const isParticipantOnline = this.roomManager.isUserOnline(participant.userId);
            if (!isParticipantOnline) {
              this.notificationService
                .sendMessageNotification(
                  participant.userId,
                  userId,
                  message,
                  conversation,
                  false // isParticipantOnline = false
                )
                .catch(error => {
                  console.error(
                    `[Socket] Error sending push notification to user ${participant.userId}:`,
                    error
                  );
                });
            }
          }
        }
      }

      console.log(
        `[Socket] Message ${message.id} sent by user ${userId} in conversation ${conversationId}`
      );
    } catch (error) {
      console.error('[Socket] Error sending message:', error);
      emitError(socket, 'Failed to send message', 'SEND_MESSAGE_ERROR');
    }
  }

  /**
   * Mark Read Handler
   */
  async handleMarkRead(socket: AuthenticatedSocket, payload: MarkReadPayload): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId, messageIds } = payload;

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant || participant.deletedAt) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      // Build message filter based on user's deletion status
      // If user cleared chat, only messages created after deletedAt are visible
      const messageWhere: any = {
        id: { in: messageIds },
        conversationId,
        // Exclude expired disappearing messages
        OR: [{ isDisappearing: false }, { expiresAt: null }, { expiresAt: { gt: new Date() } }],
      };

      // If user deleted the conversation, only allow marking messages created after deletion
      if (participant.deletedAt !== null) {
        messageWhere.createdAt = { gte: participant.deletedAt };
      }

      // Validate that messages exist and are visible to the user
      const validMessages = await prisma.message.findMany({
        where: messageWhere,
        select: { id: true },
        orderBy: { id: 'desc' },
      });

      if (validMessages.length === 0) {
        // No valid messages found - might be trying to mark old messages after clearing chat
        // Just update lastReadAt and unreadCount, but don't set lastReadMessageId
        await prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
          data: {
            lastReadAt: new Date(),
            unreadCount: 0,
            // Don't set lastReadMessageId if no valid messages
          },
        });

        console.log(
          `[Socket] User ${userId} tried to mark invalid messages as read in conversation ${conversationId} - updated read time only`
        );
        return;
      }

      // Get the latest valid message ID
      const latestMessageId = validMessages[0].id;
      const validMessageIds = validMessages.map((m: { id: number }) => m.id);

      // Update participant's last read
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          lastReadAt: new Date(),
          lastReadMessageId: latestMessageId,
          unreadCount: 0,
        },
      });

      // Update message read status (only for valid messages)
      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT) {
        // For direct messages, update message status (only valid messages)
        await prisma.message.updateMany({
          where: {
            id: { in: validMessageIds },
            conversationId,
            senderId: { not: userId }, // Only mark messages from others as read
            status: { not: MESSAGE_STATUS.READ },
          },
          data: {
            status: MESSAGE_STATUS.READ,
            readAt: new Date(),
            readByUserId: userId,
          },
        });

        // Get message senders to notify (only valid messages)
        const messages = await prisma.message.findMany({
          where: {
            id: { in: validMessageIds },
            conversationId,
            senderId: { not: userId },
          },
          select: {
            id: true,
            senderId: true,
          },
        });

        // Notify senders that messages were read
        for (const message of messages) {
          this.roomManager.broadcastToUser(message.senderId, SERVER_EVENTS.MESSAGE_READ, {
            messageId: message.id,
            conversationId,
            readAt: new Date().toISOString(),
          });
        }
      } else {
        // For group messages, create read receipts (only valid messages)
        await prisma.messageReadReceipt.createMany({
          data: validMessageIds.map((messageId: number) => ({
            messageId,
            userId,
          })),
          skipDuplicates: true,
        });

        // Broadcast read receipts to conversation (only valid messages)
        this.roomManager.broadcastToConversation(
          conversationId,
          SERVER_EVENTS.MESSAGE_READ,
          {
            messageIds: validMessageIds,
            userId,
            readAt: new Date().toISOString(),
          },
          socket.id
        );
      }

      console.log(
        `[Socket] User ${userId} marked ${validMessageIds.length} valid messages as read in conversation ${conversationId} (${messageIds.length - validMessageIds.length} invalid messages filtered)`
      );
    } catch (error) {
      console.error('[Socket] Error marking messages as read:', error);
      emitError(socket, 'Failed to mark messages as read', 'MARK_READ_ERROR');
    }
  }

  /**
   * Typing Start Handler
   */
  async handleTypingStart(socket: AuthenticatedSocket, payload: TypingStartPayload): Promise<void> {
    try {
      const { userId, user } = socket;
      if (!userId || !user) throw new Error('User not authenticated');

      const { conversationId } = payload;

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!participant) {
        console.warn(
          `[Socket] ⚠️ User ${userId} is not a participant in conversation ${conversationId} - typing indicator ignored`
        );
        return; // Silently fail if not a participant
      }
      // Allow typing indicators even if user deleted the conversation (deletedAt is set)
      // Users should be able to send typing indicators even after clearing chat history

      // Check if user has joined the conversation room (for logging/debugging)
      const conversationSockets = this.roomManager.getConversationSockets(conversationId);
      const userSockets = this.roomManager.getUserSockets(userId);
      const isUserInRoom = Array.from(userSockets).some(socketId =>
        conversationSockets.has(socketId)
      );

      if (!isUserInRoom) {
        console.warn(
          `[Socket] ⚠️ User ${userId} has not joined conversation room ${conversationId} - typing indicator may not be received by others`
        );
        // Still broadcast - recipient might be in room
      }

      // Get other participant for direct conversations (to send fallback typing indicator)
      let otherParticipantForTyping: { userId: number } | null = null;
      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT) {
        otherParticipantForTyping = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: { not: userId },
          },
          select: { userId: true },
        });
      }

      // Broadcast typing indicator to conversation (excluding sender)
      const conversationRoomName = `conversation:${conversationId}`;
      const conversationRoomSockets = this.roomManager.getConversationSockets(conversationId);
      const recipientSocketsInRoom = otherParticipantForTyping
        ? Array.from(conversationRoomSockets).filter(socketId => {
            const recipientSocket = this.roomManager.getSocketById(socketId);
            return recipientSocket?.userId === otherParticipantForTyping.userId;
          })
        : [];

      this.roomManager.broadcastToConversation(
        conversationId,
        SERVER_EVENTS.TYPING_INDICATOR,
        {
          conversationId,
          userId,
          userName: user.name || user.email,
          isTyping: true,
        },
        socket.id
      );

      console.log(
        `[Socket] ⌨️ Typing START from user ${userId} sent to conversation room "${conversationRoomName}" (${conversationRoomSockets.size} sockets in room${otherParticipantForTyping ? `, recipient ${otherParticipantForTyping.userId} has ${recipientSocketsInRoom.length} socket(s) in room` : ''})`
      );

      // ALSO send typing indicator directly to other participant's presence room as fallback
      // This ensures typing indicators work even if recipient hasn't joined conversation room
      if (otherParticipantForTyping) {
        const recipientPresenceRoomName = `user:${otherParticipantForTyping.userId}`;
        const recipientPresenceSockets = this.roomManager.getUserSockets(
          otherParticipantForTyping.userId
        );

        this.roomManager.broadcastToUser(
          otherParticipantForTyping.userId,
          SERVER_EVENTS.TYPING_INDICATOR,
          {
            conversationId,
            userId,
            userName: user.name || user.email,
            isTyping: true,
          }
        );

        console.log(
          `[Socket] ⌨️ Typing START ALSO sent to recipient ${otherParticipantForTyping.userId} presence room "${recipientPresenceRoomName}" (${recipientPresenceSockets.size} socket(s) total) - FALLBACK DELIVERY`
        );
        console.log(
          `[Socket] ⌨️ Typing delivery summary: Conversation room=${conversationRoomSockets.size} sockets, Presence room=${recipientPresenceSockets.size} sockets, Recipient in conversation room=${recipientSocketsInRoom.length > 0 ? 'YES' : 'NO'}`
        );
      }
    } catch (error) {
      console.error('[Socket] Error handling typing start:', error);
      // Silently fail for typing indicators
    }
  }

  /**
   * Typing Stop Handler
   */
  async handleTypingStop(socket: AuthenticatedSocket, payload: TypingStopPayload): Promise<void> {
    try {
      const { userId, user } = socket;
      if (!userId || !user) throw new Error('User not authenticated');

      const { conversationId } = payload;

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!participant) {
        console.warn(
          `[Socket] ⚠️ User ${userId} is not a participant in conversation ${conversationId} - typing stop ignored`
        );
        return; // Silently fail if not a participant
      }
      // Allow typing indicators even if user deleted the conversation (deletedAt is set)
      // Users should be able to send typing indicators even after clearing chat history

      // Get other participant for direct conversations (to send fallback typing indicator)
      let otherParticipantForTyping: { userId: number } | null = null;
      if (participant.conversation.type === CONVERSATION_TYPE.DIRECT) {
        otherParticipantForTyping = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: { not: userId },
          },
          select: { userId: true },
        });
      }

      // Broadcast typing stopped to conversation (excluding sender)
      const conversationRoomName = `conversation:${conversationId}`;
      const conversationRoomSockets = this.roomManager.getConversationSockets(conversationId);
      const recipientSocketsInRoom = otherParticipantForTyping
        ? Array.from(conversationRoomSockets).filter(socketId => {
            const recipientSocket = this.roomManager.getSocketById(socketId);
            return recipientSocket?.userId === otherParticipantForTyping.userId;
          })
        : [];

      this.roomManager.broadcastToConversation(
        conversationId,
        SERVER_EVENTS.TYPING_INDICATOR,
        {
          conversationId,
          userId,
          userName: user.name || user.email,
          isTyping: false,
        },
        socket.id
      );

      console.log(
        `[Socket] ⌨️ Typing STOP from user ${userId} sent to conversation room "${conversationRoomName}" (${conversationRoomSockets.size} sockets in room${otherParticipantForTyping ? `, recipient ${otherParticipantForTyping.userId} has ${recipientSocketsInRoom.length} socket(s) in room` : ''})`
      );

      // ALSO send typing stop directly to other participant's presence room as fallback
      // This ensures typing indicators work even if recipient hasn't joined conversation room
      if (otherParticipantForTyping) {
        const recipientPresenceRoomName = `user:${otherParticipantForTyping.userId}`;
        const recipientPresenceSockets = this.roomManager.getUserSockets(
          otherParticipantForTyping.userId
        );

        this.roomManager.broadcastToUser(
          otherParticipantForTyping.userId,
          SERVER_EVENTS.TYPING_INDICATOR,
          {
            conversationId,
            userId,
            userName: user.name || user.email,
            isTyping: false,
          }
        );

        console.log(
          `[Socket] ⌨️ Typing STOP ALSO sent to recipient ${otherParticipantForTyping.userId} presence room "${recipientPresenceRoomName}" (${recipientPresenceSockets.size} socket(s) total) - FALLBACK DELIVERY`
        );
        console.log(
          `[Socket] ⌨️ Typing delivery summary: Conversation room=${conversationRoomSockets.size} sockets, Presence room=${recipientPresenceSockets.size} sockets, Recipient in conversation room=${recipientSocketsInRoom.length > 0 ? 'YES' : 'NO'}`
        );
      }
    } catch (error) {
      console.error('[Socket] Error handling typing stop:', error);
      // Silently fail for typing indicators
    }
  }

  /**
   * React to Message Handler
   */
  async handleReactToMessage(
    socket: AuthenticatedSocket,
    payload: ReactToMessagePayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { messageId, emoji } = payload;

      // Verify message exists and user has access
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              participants: {
                where: {
                  userId,
                  deletedAt: null,
                },
              },
            },
          },
        },
      });

      if (!message) {
        emitError(socket, 'Message not found', 'MESSAGE_NOT_FOUND');
        return;
      }

      if (message.conversation.participants.length === 0) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      // Create or update reaction
      const reaction = await prisma.messageReaction.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
          emoji,
        },
        update: {
          emoji,
        },
      });

      // Broadcast reaction to conversation
      this.roomManager.broadcastToConversation(
        message.conversationId,
        SERVER_EVENTS.MESSAGE_REACTED,
        {
          messageId,
          userId,
          emoji,
          reactionId: reaction.id,
        },
        socket.id
      );

      console.log(`[Socket] User ${userId} reacted to message ${messageId} with ${emoji}`);
    } catch (error) {
      console.error('[Socket] Error reacting to message:', error);
      emitError(socket, 'Failed to react to message', 'REACT_ERROR');
    }
  }

  /**
   * Remove Reaction Handler
   */
  async handleRemoveReaction(
    socket: AuthenticatedSocket,
    payload: RemoveReactionPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { messageId } = payload;

      // Verify message exists and user has access
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              participants: {
                where: {
                  userId,
                  deletedAt: null,
                },
              },
            },
          },
        },
      });

      if (!message) {
        emitError(socket, 'Message not found', 'MESSAGE_NOT_FOUND');
        return;
      }

      if (message.conversation.participants.length === 0) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      // Delete reaction
      await prisma.messageReaction.deleteMany({
        where: {
          messageId,
          userId,
        },
      });

      // Broadcast reaction removal to conversation
      this.roomManager.broadcastToConversation(
        message.conversationId,
        SERVER_EVENTS.REACTION_REMOVED,
        {
          messageId,
          userId,
        },
        socket.id
      );

      console.log(`[Socket] User ${userId} removed reaction from message ${messageId}`);
    } catch (error) {
      console.error('[Socket] Error removing reaction:', error);
      emitError(socket, 'Failed to remove reaction', 'REMOVE_REACTION_ERROR');
    }
  }

  /**
   * Accept Message Request Handler
   */
  async handleAcceptMessageRequest(
    socket: AuthenticatedSocket,
    payload: AcceptMessageRequestPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { requestId } = payload;

      // Get message request
      const messageRequest = await prisma.messageRequest.findUnique({
        where: { id: requestId },
        include: {
          conversation: true,
        },
      });

      if (!messageRequest) {
        emitError(socket, 'Message request not found', 'REQUEST_NOT_FOUND');
        return;
      }

      if (messageRequest.recipientId !== userId) {
        emitError(socket, 'You are not the recipient of this request', 'NOT_RECIPIENT');
        return;
      }

      // Update request status
      await prisma.messageRequest.update({
        where: { id: requestId },
        data: {
          status: MESSAGE_REQUEST_STATUS.ACCEPTED,
        },
      });

      // Notify sender
      this.roomManager.broadcastToUser(
        messageRequest.senderId,
        SERVER_EVENTS.MESSAGE_REQUEST_ACCEPTED,
        {
          requestId,
          conversationId: messageRequest.conversationId,
        }
      );

      // Notify recipient
      socket.emit(SERVER_EVENTS.MESSAGE_REQUEST_ACCEPTED, {
        requestId,
        conversationId: messageRequest.conversationId,
      });

      console.log(`[Socket] User ${userId} accepted message request ${requestId}`);
    } catch (error) {
      console.error('[Socket] Error accepting message request:', error);
      emitError(socket, 'Failed to accept message request', 'ACCEPT_REQUEST_ERROR');
    }
  }

  /**
   * Decline Message Request Handler
   */
  async handleDeclineMessageRequest(
    socket: AuthenticatedSocket,
    payload: DeclineMessageRequestPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { requestId } = payload;

      // Get message request
      const messageRequest = await prisma.messageRequest.findUnique({
        where: { id: requestId },
      });

      if (!messageRequest) {
        emitError(socket, 'Message request not found', 'REQUEST_NOT_FOUND');
        return;
      }

      if (messageRequest.recipientId !== userId) {
        emitError(socket, 'You are not the recipient of this request', 'NOT_RECIPIENT');
        return;
      }

      // Update request status
      await prisma.messageRequest.update({
        where: { id: requestId },
        data: {
          status: MESSAGE_REQUEST_STATUS.DECLINED,
        },
      });

      // Notify sender
      this.roomManager.broadcastToUser(
        messageRequest.senderId,
        SERVER_EVENTS.MESSAGE_REQUEST_DECLINED,
        {
          requestId,
        }
      );

      // Notify recipient
      socket.emit(SERVER_EVENTS.MESSAGE_REQUEST_DECLINED, {
        requestId,
      });

      console.log(`[Socket] User ${userId} declined message request ${requestId}`);
    } catch (error) {
      console.error('[Socket] Error declining message request:', error);
      emitError(socket, 'Failed to decline message request', 'DECLINE_REQUEST_ERROR');
    }
  }

  /**
   * Create Group Chat Handler
   */
  async handleCreateGroupChat(
    socket: AuthenticatedSocket,
    payload: CreateGroupChatPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { name, description, image, participantIds } = payload;

      // Validate participant count
      if (participantIds.length < 2) {
        emitError(
          socket,
          'Group chat must have at least 2 participants',
          'INSUFFICIENT_PARTICIPANTS'
        );
        return;
      }

      // Ensure creator is in participant list
      const allParticipantIds = [...new Set([userId, ...participantIds])];

      // Create group conversation
      const conversation = await prisma.$transaction(async tx => {
        // Create conversation
        const newConversation = await tx.conversation.create({
          data: {
            type: CONVERSATION_TYPE.GROUP,
            name: name || null,
            description: description || null,
            image: image || null,
            imageStorage: image ? 's3' : null,
            createdById: userId,
            participantCount: allParticipantIds.length,
            maxParticipants: null, // Unlimited
          },
        });

        // Create participants
        await tx.conversationParticipant.createMany({
          data: allParticipantIds.map((participantId, index) => ({
            conversationId: newConversation.id,
            userId: participantId,
            role: participantId === userId ? PARTICIPANT_ROLE.ADMIN : PARTICIPANT_ROLE.MEMBER,
          })),
        });

        return newConversation;
      });

      // Notify all participants
      for (const participantId of allParticipantIds) {
        this.roomManager.broadcastToUser(participantId, SERVER_EVENTS.GROUP_CREATED, {
          conversationId: conversation.id,
          name: conversation.name,
          description: conversation.description,
          participantIds: allParticipantIds,
        });
      }

      console.log(`[Socket] User ${userId} created group chat ${conversation.id}`);
    } catch (error) {
      console.error('[Socket] Error creating group chat:', error);
      emitError(socket, 'Failed to create group chat', 'CREATE_GROUP_ERROR');
    }
  }

  /**
   * Add Participants Handler
   */
  async handleAddParticipants(
    socket: AuthenticatedSocket,
    payload: AddParticipantsPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId, userIds } = payload;

      // Verify user is admin
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant || participant.deletedAt) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      if (participant.conversation.type !== CONVERSATION_TYPE.GROUP) {
        emitError(socket, 'This is not a group conversation', 'NOT_GROUP');
        return;
      }

      if (
        participant.role !== PARTICIPANT_ROLE.ADMIN &&
        participant.role !== PARTICIPANT_ROLE.MODERATOR
      ) {
        emitError(
          socket,
          'Only admins and moderators can add participants',
          'INSUFFICIENT_PERMISSIONS'
        );
        return;
      }

      // Add participants
      const addedParticipants = await prisma.conversationParticipant.createMany({
        data: userIds.map(participantUserId => ({
          conversationId,
          userId: participantUserId,
          role: PARTICIPANT_ROLE.MEMBER,
        })),
        skipDuplicates: true,
      });

      // Update participant count
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          participantCount: {
            increment: addedParticipants.count,
          },
        },
      });

      // Notify all participants
      this.roomManager.broadcastToConversation(conversationId, SERVER_EVENTS.PARTICIPANT_ADDED, {
        conversationId,
        userIds,
        addedBy: userId,
      });

      // Notify new participants
      for (const participantUserId of userIds) {
        this.roomManager.broadcastToUser(participantUserId, SERVER_EVENTS.PARTICIPANT_ADDED, {
          conversationId,
          addedBy: userId,
        });
      }

      console.log(
        `[Socket] User ${userId} added ${userIds.length} participants to conversation ${conversationId}`
      );
    } catch (error) {
      console.error('[Socket] Error adding participants:', error);
      emitError(socket, 'Failed to add participants', 'ADD_PARTICIPANTS_ERROR');
    }
  }

  /**
   * Remove Participant Handler
   */
  async handleRemoveParticipant(
    socket: AuthenticatedSocket,
    payload: RemoveParticipantPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId, userId: targetUserId } = payload;

      // Verify user is admin
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant || participant.deletedAt) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      if (participant.conversation.type !== CONVERSATION_TYPE.GROUP) {
        emitError(socket, 'This is not a group conversation', 'NOT_GROUP');
        return;
      }

      if (
        participant.role !== PARTICIPANT_ROLE.ADMIN &&
        participant.role !== PARTICIPANT_ROLE.MODERATOR
      ) {
        emitError(
          socket,
          'Only admins and moderators can remove participants',
          'INSUFFICIENT_PERMISSIONS'
        );
        return;
      }

      // Remove participant
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId,
          userId: targetUserId,
        },
        data: {
          deletedAt: new Date(),
          leftAt: new Date(),
        },
      });

      // Update participant count
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          participantCount: {
            decrement: 1,
          },
        },
      });

      // Notify all participants
      this.roomManager.broadcastToConversation(conversationId, SERVER_EVENTS.PARTICIPANT_REMOVED, {
        conversationId,
        userId: targetUserId,
        removedBy: userId,
      });

      // Notify removed participant
      this.roomManager.broadcastToUser(targetUserId, SERVER_EVENTS.PARTICIPANT_REMOVED, {
        conversationId,
        removedBy: userId,
      });

      console.log(
        `[Socket] User ${userId} removed participant ${targetUserId} from conversation ${conversationId}`
      );
    } catch (error) {
      console.error('[Socket] Error removing participant:', error);
      emitError(socket, 'Failed to remove participant', 'REMOVE_PARTICIPANT_ERROR');
    }
  }

  /**
   * Leave Group Handler
   */
  async handleLeaveGroup(socket: AuthenticatedSocket, payload: LeaveGroupPayload): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId } = payload;

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant || participant.deletedAt) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      if (participant.conversation.type !== CONVERSATION_TYPE.GROUP) {
        emitError(socket, 'This is not a group conversation', 'NOT_GROUP');
        return;
      }

      // Remove participant
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId,
          userId,
        },
        data: {
          deletedAt: new Date(),
          leftAt: new Date(),
        },
      });

      // Update participant count
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          participantCount: {
            decrement: 1,
          },
        },
      });

      // Notify all participants
      this.roomManager.broadcastToConversation(
        conversationId,
        SERVER_EVENTS.PARTICIPANT_LEFT,
        {
          conversationId,
          userId,
        },
        socket.id
      );

      // Leave conversation room
      this.roomManager.leaveConversation(socket, conversationId);

      console.log(`[Socket] User ${userId} left group conversation ${conversationId}`);
    } catch (error) {
      console.error('[Socket] Error leaving group:', error);
      emitError(socket, 'Failed to leave group', 'LEAVE_GROUP_ERROR');
    }
  }

  /**
   * Update Group Settings Handler
   */
  async handleUpdateGroupSettings(
    socket: AuthenticatedSocket,
    payload: UpdateGroupSettingsPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { conversationId, name, description, image } = payload;

      // Verify user is admin
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        include: {
          conversation: true,
        },
      });

      if (!participant || participant.deletedAt) {
        emitError(socket, 'You are not a participant in this conversation', 'NOT_PARTICIPANT');
        return;
      }

      if (participant.conversation.type !== CONVERSATION_TYPE.GROUP) {
        emitError(socket, 'This is not a group conversation', 'NOT_GROUP');
        return;
      }

      if (participant.role !== PARTICIPANT_ROLE.ADMIN) {
        emitError(socket, 'Only admins can update group settings', 'INSUFFICIENT_PERMISSIONS');
        return;
      }

      // Update conversation
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          name: name !== undefined ? name : undefined,
          description: description !== undefined ? description : undefined,
          image: image !== undefined ? image : undefined,
          imageStorage: image ? 's3' : undefined,
        },
      });

      // Notify all participants
      this.roomManager.broadcastToConversation(
        conversationId,
        SERVER_EVENTS.GROUP_SETTINGS_UPDATED,
        {
          conversationId,
          name: updatedConversation.name,
          description: updatedConversation.description,
          image: updatedConversation.image,
          updatedBy: userId,
        }
      );

      console.log(
        `[Socket] User ${userId} updated group settings for conversation ${conversationId}`
      );
    } catch (error) {
      console.error('[Socket] Error updating group settings:', error);
      emitError(socket, 'Failed to update group settings', 'UPDATE_GROUP_SETTINGS_ERROR');
    }
  }

  /**
   * Handle Call Started
   * Automatically sends FCM notification to the other user
   */
  async handleCallStarted(socket: AuthenticatedSocket, payload: CallStartedPayload): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { channelName, isVideoCall, otherUserId } = payload;

      // Validate that the authenticated user matches the userId in payload
      if (userId !== payload.userId) {
        emitError(socket, 'User ID mismatch', 'USER_ID_MISMATCH');
        return;
      }

      // Validate other user exists
      const otherUser = await prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true },
      });

      if (!otherUser) {
        emitError(socket, 'Other user not found', 'USER_NOT_FOUND');
        return;
      }

      // Store call status
      callStatusService.setUserInCall(userId, channelName, isVideoCall, otherUserId);

      // Get caller info for notification
      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (caller) {
        // Convert isVideoCall boolean to callType (1=AUDIO, 2=VIDEO)
        const callType = isVideoCall ? CALL_TYPE.VIDEO : CALL_TYPE.AUDIO;

        // Automatically send FCM notification to the other user
        this.notificationService
          .sendCallNotification(
            otherUserId,
            userId,
            {
              callType,
              // Optional: conversationId can be extracted from channelName if needed
            },
            caller
          )
          .catch(error => {
            console.error(
              `[Socket] Error sending call notification to user ${otherUserId}:`,
              error
            );
            // Don't fail the call start if notification fails
          });
      }

      // Broadcast user call status to other users
      this.roomManager.broadcastToUser(otherUserId, SERVER_EVENTS.USER_CALL_STATUS, {
        userId,
        isInCall: true,
        channelName,
        timestamp: new Date().toISOString(),
      } as UserCallStatusResponse);

      // Also broadcast to all users who might be checking this user's status
      // (This could be optimized to only notify relevant users)
      this.roomManager.broadcastToAll(SERVER_EVENTS.USER_CALL_STATUS, {
        userId,
        isInCall: true,
        channelName,
        timestamp: new Date().toISOString(),
      } as UserCallStatusResponse);

      console.log(
        `[Socket] User ${userId} started call on channel ${channelName}, notification sent to user ${otherUserId}`
      );
    } catch (error) {
      console.error('[Socket] Error handling call started:', error);
      emitError(socket, 'Failed to handle call started', 'CALL_STARTED_ERROR');
    }
  }

  /**
   * Handle Call Ended
   */
  async handleCallEnded(socket: AuthenticatedSocket, payload: CallEndedPayload): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { channelName } = payload;

      // Validate that the authenticated user matches the userId in payload
      if (userId !== payload.userId) {
        emitError(socket, 'User ID mismatch', 'USER_ID_MISMATCH');
        return;
      }

      // Get call info before removing
      const callInfo = callStatusService.getUserCallStatus(userId);
      const otherUserId = callInfo?.otherUserId;

      // Remove call status
      callStatusService.removeUserCall(userId);

      // Notify other user if available
      if (otherUserId) {
        this.roomManager.broadcastToUser(otherUserId, SERVER_EVENTS.USER_CALL_STATUS, {
          userId,
          isInCall: false,
          timestamp: new Date().toISOString(),
        } as UserCallStatusResponse);
      }

      // Broadcast that user is now available
      this.roomManager.broadcastToAll(SERVER_EVENTS.USER_CALL_STATUS, {
        userId,
        isInCall: false,
        timestamp: new Date().toISOString(),
      } as UserCallStatusResponse);

      console.log(`[Socket] User ${userId} ended call on channel ${channelName}`);
    } catch (error) {
      console.error('[Socket] Error handling call ended:', error);
      emitError(socket, 'Failed to handle call ended', 'CALL_ENDED_ERROR');
    }
  }

  /**
   * Handle Check Call Status
   */
  async handleCheckCallStatus(
    socket: AuthenticatedSocket,
    payload: CheckCallStatusPayload
  ): Promise<void> {
    try {
      const { userId } = socket;
      if (!userId) throw new Error('User not authenticated');

      const { userId: targetUserId } = payload;

      // Get call status for the target user
      const callInfo = callStatusService.getUserCallStatus(targetUserId);

      // Send status back to requester
      socket.emit(SERVER_EVENTS.USER_CALL_STATUS, {
        userId: targetUserId,
        isInCall: !!callInfo,
        channelName: callInfo?.channelName || null,
        timestamp: new Date().toISOString(),
      } as UserCallStatusResponse);

      console.log(`[Socket] User ${userId} checked call status for user ${targetUserId}`);
    } catch (error) {
      console.error('[Socket] Error checking call status:', error);
      emitError(socket, 'Failed to check call status', 'CHECK_CALL_STATUS_ERROR');
    }
  }

  /**
   * Handle User Status Update (from mobile app)
   * Mobile app emits user_online or user_offline, server verifies with RoomManager and updates database
   * Uses UserStatusManager to prevent database overload from continuous emissions
   */
  async handleUserStatus(socket: AuthenticatedSocket, payload: UserStatusPayload): Promise<void> {
    try {
      const { userId: socketUserId } = socket;
      if (!socketUserId) {
        throw new Error('User not authenticated');
      }

      // Use userId from payload or fallback to socket userId
      const userId = payload.userId || socketUserId;
      const clientReportedIsOnline = payload.isOnline;

      console.log(`[Socket] 👤 Received user status update from client:`);
      console.log(`[Socket] 👤 Received payload:`, JSON.stringify(payload, null, 2));
      console.log(
        `[Socket] 👤 Using userId: ${userId}, client reported isOnline: ${clientReportedIsOnline}`
      );

      // Get ChatSocketServer instance
      const { ChatSocketServer } = await import('./server');
      const socketServer = ChatSocketServer.getInstance();

      if (!socketServer) {
        console.error(
          '[Socket] ChatSocketServer instance not available for broadcasting user status'
        );
        return;
      }

      // Get UserStatusManager from socket server
      const userStatusManager = socketServer.getUserStatusManager();

      if (userStatusManager) {
        // Check and update status (UserStatusManager uses RoomManager as source of truth)
        // This will only update DB if status actually changed
        await userStatusManager.checkAndUpdateStatus(userId);
        console.log(`[Socket] 👤 User ${userId} status checked and updated via UserStatusManager`);
      } else {
        console.warn('[Socket] UserStatusManager not available, falling back to direct broadcast');
      }

      // Always broadcast to other users (for real-time updates)
      // But use RoomManager as source of truth, not client emission
      const actualIsOnline = this.roomManager.isUserOnline(userId);
      await socketServer.broadcastUserStatus(userId, actualIsOnline);
      console.log(
        `[Socket] 👤 User ${userId} status broadcasted: ${actualIsOnline ? 'ONLINE' : 'OFFLINE'} (actual status from RoomManager)`
      );
    } catch (error) {
      console.error('[Socket] Error handling user status:', error);
      emitError(socket, 'Failed to handle user status', 'USER_STATUS_ERROR');
    }
  }
}
