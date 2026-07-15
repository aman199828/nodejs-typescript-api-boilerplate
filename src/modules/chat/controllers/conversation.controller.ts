/**
 * Conversation Controller
 * Handles REST API endpoints for conversation management
 */

import { Request, Response } from 'express';
import {
  ConversationService,
  CreateDirectConversationData,
  CreateGroupConversationData,
  UpdateConversationData,
} from '../services/conversation.service';
import { ApiResponse } from '../../../resources/ApiResponse';
import { MESSAGE_STATUS, CONVERSATION_TYPE } from '../constants';
import { prisma } from '../../../lib/prisma';
import { ConversationResource } from '../resources/ConversationResource';
import { ParticipantResource } from '../resources/ParticipantResource';

export class ConversationController {
  private conversationService: ConversationService;

  constructor() {
    this.conversationService = new ConversationService();
  }

  /**
   * List Conversations
   * GET /api/v1/mobile/chat/conversations
   */
  listConversations = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const {
        page = '1',
        limit = '20',
        type,
        unreadOnly = 'false',
        muted,
        search,
        sortBy = 'lastMessageAt',
        sortOrder = 'desc',
      } = req.query;

      const result = await this.conversationService.getUserConversations(userId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        type: type ? parseInt(type as string) : undefined,
        unreadOnly: unreadOnly === 'true',
        muted: muted !== undefined ? muted === 'true' : undefined,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      // Transform conversations using resource
      const transformedConversations = await ConversationResource.collection(
        result.conversations,
        userId
      );

      // Sort by unreadCount if needed
      if (sortBy === 'unreadCount') {
        transformedConversations.sort((a: any, b: any) => {
          const aUnread = a.unreadCount || 0;
          const bUnread = b.unreadCount || 0;
          const sortOrderValue = (sortOrder as 'asc' | 'desc') || 'desc';
          return sortOrderValue === 'desc' ? bUnread - aUnread : aUnread - bUnread;
        });
      }

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 20, 50);
      const totalPages = Math.ceil(result.total / limitNum) || 1;

      res.status(200).json(
        ApiResponse.success(
          {
            conversations: transformedConversations,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: result.total,
              totalPages,
              hasNextPage: pageNum < totalPages,
              hasPrevPage: pageNum > 1,
            },
          },
          'Conversations retrieved successfully'
        )
      );
    } catch (error) {
      console.error('[ConversationController] Error listing conversations:', error);
      res.status(500).json(ApiResponse.serverError('Failed to retrieve conversations'));
    }
  };

  /**
   * Get Conversation by ID
   * GET /api/v1/mobile/chat/conversations/:id
   */
  getConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      const conversation = await this.conversationService.getConversationById(
        conversationId,
        userId
      );

      if (!conversation) {
        res.status(404).json(ApiResponse.error('Conversation not found', 404));
        return;
      }

      // Transform using resource
      const transformed = await ConversationResource.transform(conversation, userId);

      res.status(200).json(ApiResponse.success(transformed, 'Conversation retrieved successfully'));
    } catch (error) {
      console.error('[ConversationController] Error getting conversation:', error);
      res.status(500).json(ApiResponse.serverError('Failed to retrieve conversation'));
    }
  };

  /**
   * Create Direct Conversation
   * POST /api/v1/mobile/chat/conversations/direct
   */
  createDirectConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { userId: recipientId } = req.body;

      if (!recipientId || isNaN(parseInt(recipientId))) {
        res.status(400).json(ApiResponse.error('Recipient user ID is required', 400));
        return;
      }

      // Validate recipient exists
      const recipient = await prisma.user.findUnique({
        where: { id: parseInt(recipientId) },
        select: { id: true, isActive: true },
      });

      if (!recipient || !recipient.isActive) {
        res.status(404).json(ApiResponse.error('Recipient user not found or inactive', 404));
        return;
      }

      const conversation = await this.conversationService.findOrCreateDirectConversation(
        userId,
        parseInt(recipientId)
      );

      // Transform using resource
      const transformed = await ConversationResource.transform(conversation, userId);

      res.status(201).json(ApiResponse.success(transformed, 'Conversation created successfully'));
    } catch (error) {
      console.error('[ConversationController] Error creating direct conversation:', error);
      res.status(500).json(ApiResponse.serverError('Failed to create conversation'));
    }
  };

  /**
   * Create Group Conversation
   * POST /api/v1/mobile/chat/conversations/groups
   */
  createGroupConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { name, description, image, imageStorage, participantIds } = req.body;

      if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
        res.status(400).json(ApiResponse.error('At least one participant is required', 400));
        return;
      }

      // Validate all participant IDs exist
      const participantIdNumbers = participantIds
        .map((id: any) => parseInt(id))
        .filter((id: number) => !isNaN(id));

      if (participantIdNumbers.length !== participantIds.length) {
        res.status(400).json(ApiResponse.error('Invalid participant IDs', 400));
        return;
      }

      const participants = await prisma.user.findMany({
        where: {
          id: { in: participantIdNumbers },
          isActive: true,
        },
        select: { id: true },
      });

      if (participants.length !== participantIdNumbers.length) {
        res
          .status(400)
          .json(ApiResponse.error('One or more participants not found or inactive', 400));
        return;
      }

      const conversation = await this.conversationService.createGroupConversation({
        userId,
        name,
        description,
        image,
        imageStorage: imageStorage || (image ? 's3' : undefined),
        participantIds: participantIdNumbers,
      });

      // Transform using resource
      const transformed = await ConversationResource.transform(conversation, userId);

      res
        .status(201)
        .json(ApiResponse.success(transformed, 'Group conversation created successfully'));
    } catch (error: any) {
      console.error('[ConversationController] Error creating group conversation:', error);
      if (error.message.includes('at least 2 participants')) {
        res.status(400).json(ApiResponse.error(error.message, 400));
      } else {
        res.status(500).json(ApiResponse.serverError('Failed to create group conversation'));
      }
    }
  };

  /**
   * Update Conversation (Group Settings)
   * PUT /api/v1/mobile/chat/conversations/:id
   */
  updateConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      const { name, description, image, imageStorage } = req.body;

      const conversation = await this.conversationService.updateConversation(
        conversationId,
        userId,
        {
          name,
          description,
          image,
          imageStorage: imageStorage || (image ? 's3' : undefined),
        }
      );

      // Transform using resource
      const transformed = await ConversationResource.transform(conversation, userId);

      res.status(200).json(ApiResponse.success(transformed, 'Conversation updated successfully'));
    } catch (error: any) {
      console.error('[ConversationController] Error updating conversation:', error);
      if (error.message.includes('Only admins')) {
        res.status(403).json(ApiResponse.error(error.message, 403));
      } else {
        res.status(500).json(ApiResponse.serverError('Failed to update conversation'));
      }
    }
  };

  /**
   * Delete/Leave Conversation
   * DELETE /api/v1/mobile/chat/conversations/:id
   */
  deleteOrLeaveConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      const { deleteFor } = req.query;
      const deleteForUserId = deleteFor ? parseInt(deleteFor as string) : undefined;

      await this.conversationService.deleteOrLeaveConversation(
        conversationId,
        userId,
        deleteForUserId
      );

      res.status(200).json(ApiResponse.success(null, 'Conversation deleted successfully'));
    } catch (error: any) {
      console.error('[ConversationController] Error deleting conversation:', error);
      if (error.message.includes('not found')) {
        res.status(404).json(ApiResponse.error(error.message, 404));
      } else {
        res.status(500).json(ApiResponse.serverError('Failed to delete conversation'));
      }
    }
  };

  /**
   * Get Conversation Participants
   * GET /api/v1/mobile/chat/conversations/:id/participants
   */
  getParticipants = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (!participant || participant.deletedAt) {
        res
          .status(403)
          .json(ApiResponse.error('You are not a participant in this conversation', 403));
        return;
      }

      const { page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(parseInt(page as string) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      const [participants, total] = await Promise.all([
        prisma.conversationParticipant.findMany({
          where: {
            conversationId,
            deletedAt: null,
          },
          skip,
          take: limitNum,
          include: {
            user: {
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
            joinedAt: 'asc',
          },
        }),
        prisma.conversationParticipant.count({
          where: {
            conversationId,
            deletedAt: null,
          },
        }),
      ]);

      // Transform participants
      const transformedParticipants = await ParticipantResource.collection(participants, userId);

      const totalPages = Math.ceil(total / limitNum) || 1;

      res.status(200).json(
        ApiResponse.success(
          {
            participants: transformedParticipants,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total,
              totalPages,
              hasNextPage: pageNum < totalPages,
              hasPrevPage: pageNum > 1,
            },
          },
          'Participants retrieved successfully'
        )
      );
    } catch (error) {
      console.error('[ConversationController] Error getting participants:', error);
      res.status(500).json(ApiResponse.serverError('Failed to retrieve participants'));
    }
  };

  /**
   * Mark Conversation as Read
   * POST /api/v1/mobile/chat/conversations/:id/read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      const { messageIds } = req.body;

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
            select: { type: true },
          },
        },
      });

      if (!participant || participant.deletedAt) {
        res
          .status(403)
          .json(ApiResponse.error('You are not a participant in this conversation', 403));
        return;
      }

      const conversation = participant.conversation;

      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        // Mark specific messages as read
        const messageIdNumbers = messageIds
          .map((id: any) => parseInt(id))
          .filter((id: number) => !isNaN(id));

        if (conversation.type === CONVERSATION_TYPE.DIRECT) {
          // For direct chats, update message status
          await prisma.message.updateMany({
            where: {
              id: { in: messageIdNumbers },
              conversationId,
              senderId: { not: userId },
              status: { lt: MESSAGE_STATUS.READ },
            },
            data: {
              status: MESSAGE_STATUS.READ,
              readAt: new Date(),
              readByUserId: userId,
              updatedAt: new Date(),
            },
          });
        } else {
          // For group chats, create read receipts
          await prisma.messageReadReceipt.createMany({
            data: messageIdNumbers.map((messageId: number) => ({
              messageId,
              userId,
            })),
            skipDuplicates: true,
          });
        }

        // Update participant's last read
        const lastReadMessageId = Math.max(...messageIdNumbers);
        await prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
          data: {
            lastReadAt: new Date(),
            lastReadMessageId,
            unreadCount: 0,
            updatedAt: new Date(),
          },
        });
      } else {
        // Mark all unread messages as read
        if (conversation.type === CONVERSATION_TYPE.DIRECT) {
          await prisma.message.updateMany({
            where: {
              conversationId,
              senderId: { not: userId },
              status: { lt: MESSAGE_STATUS.READ },
            },
            data: {
              status: MESSAGE_STATUS.READ,
              readAt: new Date(),
              readByUserId: userId,
              updatedAt: new Date(),
            },
          });
        }

        // Get last message ID
        const lastMessage = await prisma.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        await prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
          data: {
            lastReadAt: new Date(),
            lastReadMessageId: lastMessage?.id || null,
            unreadCount: 0,
            updatedAt: new Date(),
          },
        });
      }

      const updatedParticipant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        select: {
          unreadCount: true,
          lastReadAt: true,
          lastReadMessageId: true,
        },
      });

      res.status(200).json(
        ApiResponse.success(
          {
            unreadCount: updatedParticipant?.unreadCount || 0,
            lastReadMessageId: updatedParticipant?.lastReadMessageId || null,
            lastReadAt: updatedParticipant?.lastReadAt?.toISOString() || null,
          },
          'Conversation marked as read'
        )
      );
    } catch (error) {
      console.error('[ConversationController] Error marking conversation as read:', error);
      res.status(500).json(ApiResponse.serverError('Failed to mark conversation as read'));
    }
  };

  /**
   * Mute/Unmute Conversation
   * POST /api/v1/mobile/chat/conversations/:id/mute
   */
  muteConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const conversationIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversationId = parseInt(conversationIdParam, 10);
      if (isNaN(conversationId)) {
        res.status(400).json(ApiResponse.error('Invalid conversation ID', 400));
        return;
      }

      const { muted } = req.body;

      if (typeof muted !== 'boolean') {
        res.status(400).json(ApiResponse.error('muted must be a boolean', 400));
        return;
      }

      // Verify user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (!participant || participant.deletedAt) {
        res
          .status(403)
          .json(ApiResponse.error('You are not a participant in this conversation', 403));
        return;
      }

      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          isMuted: muted,
          updatedAt: new Date(),
        },
      });

      res
        .status(200)
        .json(
          ApiResponse.success(
            { isMuted: muted },
            `Conversation ${muted ? 'muted' : 'unmuted'} successfully`
          )
        );
    } catch (error) {
      console.error('[ConversationController] Error muting conversation:', error);
      res.status(500).json(ApiResponse.serverError('Failed to mute/unmute conversation'));
    }
  };
}
