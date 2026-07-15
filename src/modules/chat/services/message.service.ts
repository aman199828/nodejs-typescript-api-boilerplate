/**
 * Message Service
 * Shared business logic for message creation and management
 * Used by both Socket.IO handlers and REST API controllers
 */

import { PrismaClient } from '@prisma/client';
import { MESSAGE_STATUS, MESSAGE_TYPE, CONVERSATION_TYPE, isValidMessageType } from '../constants';
import { prisma } from '../../../lib/prisma';
import {
  getStorageProvider,
  STORAGE_FOLDERS,
  STORAGE_SUB_FOLDERS,
} from '../../../services/storage';
import { STORAGE_TYPES, getCurrentStorageType } from '../../../constants/storage.constants';

export interface MediaItem {
  mediaUrl: string; // Full S3 URL
  thumbnailUrl?: string; // Full S3 URL for thumbnail
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  mediaType?: string; // "image", "video", "audio", "file"
  duration?: number; // For video/audio in seconds
}

export interface CreateMessageData {
  conversationId?: number;
  recipientId?: number; // Required if conversationId is not provided
  senderId: number;
  content?: string;
  messageType: number;
  media?: MediaItem[]; // Array of media files
  mediaUrl?: string; // S3 URL if mobile already uploaded (backward compatibility)
  mediaStorage?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  replyToId?: number;
  isDisappearing?: boolean;
  expiresAt?: Date | string;
  sharedUserId?: number;
  sharedLocation?: string;
  uuid?: string; // NEW: Client-provided UUID for deduplication
  message_time?: Date; // NEW: UTC timestamp from client
}

export interface MessageResponse {
  id: number;
  uuid: string | null; // Can be null for backward compatibility during migration
  conversationId: number;
  senderId: number;
  content: string | null;
  messageType: number;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  fileName: string | null;
  mimeType: string | null;
  replyToId: number | null;
  sharedUserId: number | null;
  sharedLocation: string | null;
  status: number;
  isDisappearing: boolean;
  expiresAt: Date | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  sender?: {
    id: number;
    name: string | null;
    userName: string | null;
    profileFile: string | null;
  };
  replyTo?: {
    id: number;
    content: string | null;
    senderId: number;
    sender?: {
      id: number;
      name: string | null;
      userName: string | null;
    };
  };
}

export class MessageService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * Generate 12-character UUID format: xxxxxxxx-xxxx
   */
  private generateShortUUID(): string {
    // Generate 8 characters
    const part1 = Math.random().toString(36).substring(2, 10).padEnd(8, '0');
    // Generate 4 characters
    const part2 = Math.random().toString(36).substring(2, 6).padEnd(4, '0');
    return `${part1}-${part2}`;
  }

  /**
   * Extract S3 key from full S3 URL
   * Example: https://bucket.s3.region.amazonaws.com/public/uploads/chat/2/images/file.png
   * Returns: public/uploads/chat/2/images/file.png
   * If already a key (no http), returns as-is
   */
  private extractS3Key(url: string | null | undefined): string | null {
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
      console.error('[MessageService] Failed to extract S3 key from URL:', url, error);
      // If extraction fails, return original (might be a key already)
      return url;
    }
  }

  /**
   * Find or create a direct conversation between two users
   */
  async findOrCreateDirectConversation(senderId: number, recipientId: number): Promise<number> {
    // Check if a direct conversation already exists
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        type: CONVERSATION_TYPE.DIRECT,
        participants: {
          every: {
            userId: { in: [senderId, recipientId] },
          },
        },
        participantCount: 2,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingConversation) {
      return existingConversation.id;
    }

    // Create new direct conversation
    const newConversation = await this.prisma.conversation.create({
      data: {
        type: CONVERSATION_TYPE.DIRECT,
        createdById: senderId,
        participantCount: 2,
        participants: {
          create: [
            { userId: senderId, role: 3 }, // MEMBER
            { userId: recipientId, role: 3 }, // MEMBER
          ],
        },
      },
      select: { id: true },
    });

    return newConversation.id;
  }

  /**
   * Validate message data
   */
  async validateMessageData(data: CreateMessageData): Promise<{ valid: boolean; error?: string }> {
    // Validate message type
    if (!isValidMessageType(data.messageType)) {
      return { valid: false, error: 'Invalid message type' };
    }

    // Validate content or media for text messages
    if (data.messageType === MESSAGE_TYPE.TEXT && !data.content?.trim() && !data.mediaUrl) {
      return { valid: false, error: 'Message content or media is required for text messages' };
    }

    // Note: Media messages can have mediaUrl (stored from media array) or be text-only with media array
    // The validation is handled at the controller/socket level before calling this service

    // Validate conversation or recipient
    if (!data.conversationId && !data.recipientId) {
      return { valid: false, error: 'Either conversationId or recipientId is required' };
    }

    // If conversationId is provided, verify user is a participant
    if (data.conversationId) {
      const participant = await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: data.conversationId,
            userId: data.senderId,
          },
        },
      });

      if (!participant || participant.deletedAt) {
        return { valid: false, error: 'You are not a participant in this conversation' };
      }
    }

    // Validate reply exists if replyToId provided
    if (data.replyToId && data.conversationId) {
      const replyToMessage = await this.prisma.message.findUnique({
        where: { id: data.replyToId },
      });
      if (!replyToMessage || replyToMessage.conversationId !== data.conversationId) {
        return { valid: false, error: 'Reply message not found' };
      }
    }

    return { valid: true };
  }

  /**
   * Create a message
   */
  async createMessage(data: CreateMessageData): Promise<MessageResponse> {
    // Find or create conversation
    let conversationId = data.conversationId;
    if (!conversationId && data.recipientId) {
      conversationId = await this.findOrCreateDirectConversation(data.senderId, data.recipientId);
    }

    if (!conversationId) {
      throw new Error('Failed to find or create conversation');
    }

    // Calculate expiresAt for disappearing messages
    let messageExpiresAt: Date | null = null;
    if (data.isDisappearing) {
      if (data.expiresAt) {
        messageExpiresAt =
          typeof data.expiresAt === 'string' ? new Date(data.expiresAt) : data.expiresAt;
      } else {
        // Default: 24 hours from now
        messageExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    }

    // Handle media: use media array if provided, otherwise use single mediaUrl (backward compatibility)
    const hasMedia = data.media && Array.isArray(data.media) && data.media.length > 0;
    const firstMedia = hasMedia && data.media ? data.media[0] : null;

    // Extract S3 keys from URLs (store only keys, not full URLs)
    const finalMediaUrl = this.extractS3Key(firstMedia?.mediaUrl || data.mediaUrl || null);
    const finalThumbnailUrl = this.extractS3Key(
      firstMedia?.thumbnailUrl || data.thumbnailUrl || null
    );
    const finalFileName = firstMedia?.fileName || data.fileName || null;
    const finalFileSize = firstMedia?.fileSize || data.fileSize || null;
    const finalMimeType = firstMedia?.mimeType || data.mimeType || null;
    const finalMediaStorage = data.mediaStorage || (finalMediaUrl ? STORAGE_TYPES.S3 : null);

    // Handle UUID: generate if not provided (backward compatibility)
    let messageUuid = data.uuid;
    if (!messageUuid) {
      // Generate 12-character UUID format: xxxxxxxx-xxxx
      messageUuid = this.generateShortUUID();
      console.log(`[MessageService] Generated UUID for message: ${messageUuid}`);
    }

    // Ensure UUID is unique (regenerate if collision - should be rare)
    let attempts = 0;
    while (attempts < 5) {
      const existing = await this.prisma.message.findUnique({
        where: { uuid: messageUuid },
        select: { id: true },
      });

      if (!existing) {
        break; // UUID is unique
      }

      // Collision detected - regenerate
      messageUuid = this.generateShortUUID();
      attempts++;
      console.warn(`[MessageService] UUID collision detected, regenerating: ${messageUuid}`);
    }

    if (attempts >= 5) {
      throw new Error('Failed to generate unique UUID after 5 attempts');
    }

    // Handle message_time: use provided time or current time
    const messageTime = data.message_time || new Date();

    // Create message in database
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: data.senderId,
        content: data.content || null,
        messageType: data.messageType,
        mediaUrl: finalMediaUrl,
        mediaStorage: finalMediaStorage,
        thumbnailUrl: finalThumbnailUrl,
        fileSize: finalFileSize,
        fileName: finalFileName,
        mimeType: finalMimeType,
        replyToId: data.replyToId || null,
        sharedUserId: data.sharedUserId || null,
        sharedLocation: data.sharedLocation || null,
        status: MESSAGE_STATUS.SENT,
        isDisappearing: data.isDisappearing || false,
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
      },
    });

    // Create MessageMedia records if media array is provided
    if (hasMedia && data.media && Array.isArray(data.media)) {
      // Filter out items with null mediaUrl and map to create records
      const mediaRecords = data.media
        .map((item, index) => {
          const extractedKey = this.extractS3Key(item.mediaUrl);
          // Only include items with valid mediaUrl
          if (!extractedKey) {
            console.warn(
              `[MessageService] Skipping media item at index ${index} - invalid mediaUrl`
            );
            return null;
          }
          return {
            messageId: message.id,
            mediaUrl: extractedKey, // Store only S3 key, not full URL
            mediaStorage: STORAGE_TYPES.S3,
            thumbnailUrl: this.extractS3Key(item.thumbnailUrl || null), // Store only S3 key
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
        await this.prisma.messageMedia.createMany({
          data: mediaRecords,
        });
      }
    }

    // Update conversation last message
    await this.prisma.conversation.update({
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
    const conversationCheck = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        deletedAt: true,
        type: true,
      },
    });

    const allParticipants = await this.prisma.conversationParticipant.findMany({
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
          `[MessageService] All ${totalCount} participants deleted conversation ${conversationId}, marking conversation as deleted`
        );
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            deletedAt: new Date(),
          },
        });
      } else if (!allDeleted && conversationCheck.deletedAt) {
        // At least one participant is active - restore the conversation
        // But keep participant deletedAt timestamps for message filtering
        console.log(
          `[MessageService] Conversation ${conversationId} was deleted but ${totalCount - deletedCount} participant(s) are active, restoring conversation`
        );
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            deletedAt: null,
          },
        });
      }
    }

    // Find participants who deleted the conversation (we still want to increment their unread count)
    const deletedParticipants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: data.senderId },
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

      await this.prisma.conversationParticipant.updateMany({
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

    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId: {
          not: data.senderId,
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

    // Get conversation type for status update
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });

    // Update status to delivered for direct messages
    if (conversation?.type === CONVERSATION_TYPE.DIRECT) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MESSAGE_STATUS.DELIVERED,
        },
      });
    }

    const messageWithRelations = message as any;
    return {
      id: message.id,
      uuid: message.uuid || this.generateShortUUID(), // Generate UUID if null (backward compatibility)
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl,
      thumbnailUrl: message.thumbnailUrl,
      fileSize: message.fileSize,
      fileName: message.fileName,
      mimeType: message.mimeType,
      replyToId: message.replyToId,
      sharedUserId: message.sharedUserId,
      sharedLocation: message.sharedLocation,
      status: message.status,
      isDisappearing: message.isDisappearing,
      expiresAt: message.expiresAt,
      isEdited: message.isEdited,
      isDeleted: message.isDeleted,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: messageWithRelations.sender
        ? {
            id: messageWithRelations.sender.id,
            name: messageWithRelations.sender.name,
            userName: messageWithRelations.sender.userName,
            profileFile: messageWithRelations.sender.profileFile,
          }
        : undefined,
      replyTo: messageWithRelations.replyTo
        ? {
            id: messageWithRelations.replyTo.id,
            content: messageWithRelations.replyTo.content,
            senderId: messageWithRelations.replyTo.senderId,
            sender: messageWithRelations.replyTo.sender
              ? {
                  id: messageWithRelations.replyTo.sender.id,
                  name: messageWithRelations.replyTo.sender.name,
                  userName: messageWithRelations.replyTo.sender.userName,
                }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * Upload file to S3 and return file key
   */
  async uploadFileToS3(
    file: Express.Multer.File,
    userUuid: string
  ): Promise<{ fileKey: string; url: string; size: number; mimeType: string }> {
    const storage = getStorageProvider();
    const currentStorageType = getCurrentStorageType();

    // Determine subfolder based on file type
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');
    const isAudio = file.mimetype.startsWith('audio/');

    let subFolder: (typeof STORAGE_SUB_FOLDERS)[keyof typeof STORAGE_SUB_FOLDERS] | undefined;
    if (isVideo) {
      subFolder = STORAGE_SUB_FOLDERS.VIDEOS;
    } else if (isImage) {
      subFolder = STORAGE_SUB_FOLDERS.IMAGES;
    } else if (isAudio) {
      subFolder = STORAGE_SUB_FOLDERS.AUDIO;
    } else {
      subFolder = STORAGE_SUB_FOLDERS.IMAGES; // Default to images folder for generic files
    }

    const uploadResult = await storage.upload(file, {
      folder: STORAGE_FOLDERS.CHAT,
      subFolder,
      userUuid,
    });

    return {
      fileKey: uploadResult.fileKey,
      url: uploadResult.url,
      size: uploadResult.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Get messages from a conversation with pagination
   * Supports both offset-based and cursor-based pagination
   */
  async getMessages(
    conversationId: number,
    userId: number,
    options: {
      page?: number;
      limit?: number;
      before?: number;
      after?: number;
      messageType?: number;
      search?: string;
      fromDate?: string;
      toDate?: string;
      includeDeleted?: boolean;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    messages: any[];
    pagination: {
      method: 'offset' | 'cursor';
      // Offset-based fields
      page?: number;
      total?: number;
      totalPages?: number;
      // Cursor-based fields
      nextCursor?: number | null;
      prevCursor?: number | null;
      // Common fields
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    conversation?: {
      id: number;
      type: number;
      unreadCount: number;
      lastReadMessageId: number | null;
    };
  }> {
    // Verify user is a participant
    // Note: We check if participant exists, but we allow participants with deletedAt set
    // because the conversation might have been restored (deletedAt will be null after restoration)
    // The conversation listing already handles filtering based on deletedAt
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error('You are not a participant in this conversation');
    }

    // Message filtering based on deletion status:
    // - If participant has deletedAt set, only show messages created AFTER deletedAt timestamp
    //   This means A (who deleted) will only see NEW messages sent after deletion
    // - If participant has deletedAt: null, show ALL messages (no filtering)
    //   This means B (who didn't delete) will see all messages
    let messageCutoffTimestamp: Date | null = null;

    if (participant.deletedAt !== null) {
      // User deleted the conversation - only show messages sent after deletion
      // Use deletedAt as the cutoff timestamp
      messageCutoffTimestamp = participant.deletedAt;
      console.log(
        `[MessageService] User ${userId} deleted conversation ${conversationId} at ${participant.deletedAt}, filtering messages before this timestamp`
      );
    }

    // Verify conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Parse and validate options
    const limit = Math.min(Math.max(1, options.limit || 50), 100);
    const sortOrder = options.sortOrder || 'desc';
    const includeDeleted = options.includeDeleted || false;

    // Determine pagination method
    let paginationMethod: 'offset' | 'cursor-before' | 'cursor-after' | 'cursor-initial';
    if (options.page !== undefined) {
      paginationMethod = 'offset';
    } else if (options.before !== undefined) {
      paginationMethod = 'cursor-before';
    } else if (options.after !== undefined) {
      paginationMethod = 'cursor-after';
    } else {
      paginationMethod = 'cursor-initial';
    }

    // Build where clause
    const where: any = {
      conversationId,
      // Exclude expired disappearing messages
      OR: [{ isDisappearing: false }, { expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    // Build AND conditions array to properly combine filters
    const andConditions: any[] = [];

    // Build createdAt filter (combines messageCutoffTimestamp and date range filters)
    const createdAtFilter: any = {};

    // If user deleted the conversation, only show messages created after deletion
    // This filter must be applied to prevent old messages from appearing
    if (messageCutoffTimestamp) {
      createdAtFilter.gte = messageCutoffTimestamp;
    }

    // Add date range filters (must respect messageCutoffTimestamp)
    if (options.fromDate || options.toDate) {
      if (options.fromDate) {
        const fromDate = new Date(options.fromDate);
        // If user deleted conversation, ensure fromDate doesn't go before deletion timestamp
        if (messageCutoffTimestamp && fromDate < messageCutoffTimestamp) {
          createdAtFilter.gte = messageCutoffTimestamp;
        } else {
          createdAtFilter.gte = fromDate;
        }
      }
      if (options.toDate) {
        createdAtFilter.lte = new Date(options.toDate);
      }
    }

    // Add createdAt filter if any conditions were set
    if (Object.keys(createdAtFilter).length > 0) {
      andConditions.push({
        createdAt: createdAtFilter,
      });
    }

    // Handle deleted messages
    if (!includeDeleted) {
      const deletedConditions: any[] = [
        { isDeleted: false },
        { deletedForUserId: null }, // Deleted for everyone
        { deletedForUserId: { not: userId } }, // Not deleted for current user
      ];

      // Always check deleted conditions
      // If messageCutoffTimestamp is set, the timestamp filter already handles hiding old messages
      // but we still need to check isDeleted and deletedForUserId for the visible messages
      andConditions.push({
        OR: deletedConditions,
      });
    }

    // Add AND conditions if any exist
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Add filters
    if (options.messageType) {
      where.messageType = options.messageType;
    }

    if (options.search) {
      where.content = {
        contains: options.search,
        mode: 'insensitive',
      };
    }

    // Add cursor-based pagination
    if (paginationMethod === 'cursor-before') {
      where.id = { lt: options.before };
    } else if (paginationMethod === 'cursor-after') {
      where.id = { gt: options.after };
    }

    // Build query options
    const queryOptions: any = {
      where,
      take: limit,
      orderBy: {
        createdAt: sortOrder,
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
    };

    // Add offset-based pagination
    if (paginationMethod === 'offset') {
      const page = Math.max(1, options.page || 1);
      queryOptions.skip = (page - 1) * limit;
    }

    // Fetch messages
    const messages = await this.prisma.message.findMany(queryOptions);

    // Get total count for offset-based pagination
    let total: number = 0;
    let totalPages: number = 0;
    if (paginationMethod === 'offset') {
      total = await this.prisma.message.count({ where });
      totalPages = Math.ceil(total / limit);
    }

    // Build pagination metadata
    const pagination: any = {
      method: paginationMethod.startsWith('cursor') ? 'cursor' : 'offset',
      limit,
    };

    if (paginationMethod === 'offset') {
      const page = Math.max(1, options.page || 1);
      pagination.page = page;
      pagination.total = total;
      pagination.totalPages = totalPages;
      pagination.hasNextPage = page < totalPages;
      pagination.hasPrevPage = page > 1;
    } else {
      // Cursor-based pagination
      pagination.nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null;
      pagination.prevCursor = messages.length > 0 ? messages[0].id : null;

      if (paginationMethod === 'cursor-before') {
        pagination.hasNextPage = messages.length === limit; // If we got full page, there might be more
        pagination.hasPrevPage = true; // We loaded older messages, so there are newer ones
      } else if (paginationMethod === 'cursor-after') {
        pagination.hasNextPage = true; // We loaded newer messages, so there might be even newer ones
        pagination.hasPrevPage = messages.length === limit; // If we got full page, there might be older ones
      } else {
        // cursor-initial
        pagination.hasNextPage = messages.length === limit;
        pagination.hasPrevPage = false;
      }
    }

    // Get conversation metadata
    const conversationMeta = {
      id: conversation.id,
      type: conversation.type,
      unreadCount: participant.unreadCount,
      lastReadMessageId: participant.lastReadMessageId,
    };

    return {
      messages,
      pagination,
      conversation: conversationMeta,
    };
  }

  /**
   * Get a single message by ID with all relations
   */
  async getMessageById(messageId: number, userId: number): Promise<any> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
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

    if (!message) {
      return null;
    }

    // Transform using MessageResource
    const { MessageResource } = await import('../resources/MessageResource');
    return await MessageResource.transform(message, userId);
  }
}
