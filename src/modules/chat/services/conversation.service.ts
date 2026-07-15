/**
 * Conversation Service
 * Shared business logic for conversation management
 * Used by both Socket.IO handlers and REST API controllers
 */

import { PrismaClient } from '@prisma/client';
import { CONVERSATION_TYPE, PARTICIPANT_ROLE } from '../constants';
import { prisma } from '../../../lib/prisma';
import { STORAGE_FOLDERS } from '../../../services/storage';
import { getBlockedUserIds } from '../../../utils/block.utils';

export interface CreateDirectConversationData {
  userId: number; // Current user ID
  recipientId: number; // Other user ID
}

export interface CreateGroupConversationData {
  userId: number; // Creator ID
  name?: string;
  description?: string;
  image?: string;
  imageStorage?: string;
  participantIds: number[];
}

export interface UpdateConversationData {
  name?: string;
  description?: string;
  image?: string;
  imageStorage?: string;
}

// ConversationResponse type removed - service returns raw Prisma data

export class ConversationService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * Find or create a direct conversation between two users
   */
  async findOrCreateDirectConversation(userId: number, recipientId: number): Promise<any> {
    // Check if a direct conversation already exists
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        type: CONVERSATION_TYPE.DIRECT,
        participants: {
          every: {
            userId: { in: [userId, recipientId] },
          },
        },
        participantCount: 2,
        deletedAt: null,
      },
      include: {
        participants: {
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
        },
      },
    });

    if (existingConversation) {
      return existingConversation;
    }

    // Create new direct conversation
    const newConversation = await this.prisma.conversation.create({
      data: {
        type: CONVERSATION_TYPE.DIRECT,
        createdById: userId,
        participantCount: 2,
        participants: {
          create: [
            { userId: userId, role: PARTICIPANT_ROLE.MEMBER },
            { userId: recipientId, role: PARTICIPANT_ROLE.MEMBER },
          ],
        },
      },
      include: {
        lastMessage: {
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
            media: {
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        participants: {
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
        },
        creator: {
          select: {
            id: true,
            name: true,
            userName: true,
          },
        },
      },
    });

    return newConversation;
  }

  /**
   * Create a group conversation
   */
  async createGroupConversation(data: CreateGroupConversationData): Promise<any> {
    // Ensure creator is in participant list
    const allParticipantIds = [...new Set([data.userId, ...data.participantIds])];

    if (allParticipantIds.length < 2) {
      throw new Error('Group conversation must have at least 2 participants');
    }

    // Create group conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        type: CONVERSATION_TYPE.GROUP,
        name: data.name || null,
        description: data.description || null,
        image: data.image || null,
        imageStorage: data.imageStorage || (data.image ? 's3' : null),
        createdById: data.userId,
        participantCount: allParticipantIds.length,
        maxParticipants: null, // Unlimited
        participants: {
          create: allParticipantIds.map(participantId => ({
            userId: participantId,
            role: participantId === data.userId ? PARTICIPANT_ROLE.ADMIN : PARTICIPANT_ROLE.MEMBER,
          })),
        },
      },
      include: {
        participants: {
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
        },
      },
    });

    return conversation;
  }

  /**
   * Get conversations for a user with filters and pagination
   */
  async getUserConversations(
    userId: number,
    options: {
      page?: number;
      limit?: number;
      type?: number;
      unreadOnly?: boolean;
      muted?: boolean;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    conversations: any[];
    total: number;
  }> {
    const {
      page = 1,
      limit = 20,
      type,
      unreadOnly = false,
      muted,
      search,
      sortBy = 'lastMessageAt',
      sortOrder = 'desc',
    } = options;

    const pageNum = Math.max(page, 1);
    const limitNum = Math.min(Math.max(limit, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    // IMPORTANT: Show conversations even if user deleted them (deletedAt is set)
    // When A deletes, the conversation should still appear in A's listing
    // A will only see messages sent after the deletion (filtered in getMessages)
    // B will see all messages regardless of A's deletion status
    // Note: We don't filter by deletedAt in the participants.some query
    // This means Prisma will find the participant regardless of deletedAt value
    const where: any = {
      AND: [
        {
          participants: {
            some: {
              userId: userId, // Current user's participant
              // Don't specify deletedAt filter - this will match participants with any deletedAt value
              // (both null and not null)
            },
          },
        },
        {
          deletedAt: null, // Conversation itself is not deleted
        },
        {
          isActive: true, // Conversation is active
        },
      ],
    };

    // Type filter
    if (type !== undefined) {
      where.type = type;
    }

    // Unread only filter
    if (unreadOnly) {
      // Add to AND array instead of overwriting
      // Don't filter by deletedAt - show conversations with unread even if deleted
      where.AND.push({
        participants: {
          some: {
            userId: userId,
            // Don't filter by deletedAt - show unread conversations even if deleted
            unreadCount: { gt: 0 },
          },
        },
      });
    }

    // Muted filter
    if (muted !== undefined) {
      // Add to AND array instead of overwriting
      // Don't filter by deletedAt - show muted conversations even if deleted
      where.AND.push({
        participants: {
          some: {
            userId: userId,
            // Don't filter by deletedAt - show muted conversations even if deleted
            isMuted: muted,
          },
        },
      });
    }

    // Search filter (conversation name or participant names)
    // Add to AND array to preserve the base conditions
    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          {
            participants: {
              some: {
                user: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { userName: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    // Get total count
    console.log(
      `[ConversationService] Getting conversations for user ${userId}, where clause:`,
      JSON.stringify(where, null, 2)
    );
    const total = await this.prisma.conversation.count({ where });
    console.log(`[ConversationService] Found ${total} conversations for user ${userId}`);

    // Build order by
    const orderBy: any = {};
    if (sortBy === 'lastMessageAt') {
      orderBy.lastMessageAt = sortOrder;
    } else if (sortBy === 'createdAt') {
      orderBy.createdAt = sortOrder;
    } else if (sortBy === 'unreadCount') {
      // This requires a join, so we'll sort in memory
      orderBy.lastMessageAt = 'desc';
    }

    // Fetch conversations
    // Note: We include ALL participants (even deleted ones) so we can check the current user's status
    // We'll filter them later for the response
    const conversations = await this.prisma.conversation.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        lastMessage: {
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
            media: {
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        participants: {
          // Include ALL participants to check the current user's deletedAt status
          // We'll filter non-deleted ones for the response
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
        },
        creator: {
          select: {
            id: true,
            name: true,
            userName: true,
          },
        },
      },
    });

    // Get blocked user IDs for the current user
    const blockedUserIds = await getBlockedUserIds(userId);

    // Filter conversations and participants
    console.log(
      `[ConversationService] Processing ${conversations.length} conversations for user ${userId}`
    );
    const filteredConversations = conversations
      .map((conversation: any) => {
        // Find the current user's participant (check deletedAt status)
        const userParticipant = conversation.participants.find((p: any) => p.userId === userId);

        console.log(
          `[ConversationService] Conversation ${conversation.id}: userParticipant found: ${!!userParticipant}, deletedAt: ${userParticipant?.deletedAt || 'N/A'}, total participants: ${conversation.participants.length}`
        );

        // For direct conversations, check if user deleted it
        if (conversation.type === CONVERSATION_TYPE.DIRECT) {
          // If user's participant doesn't exist or has deletedAt set, user has deleted it
          // But we still want to show it in the listing (per requirements)
          // Only exclude if the other participant is blocked
          if (!userParticipant || userParticipant.deletedAt) {
            // Find the other participant
            const otherParticipant = conversation.participants.find(
              (p: any) => p.userId !== userId
            );

            // If other participant is blocked, exclude this conversation
            if (otherParticipant && blockedUserIds.includes(otherParticipant.userId)) {
              console.log(
                `[ConversationService] Excluding conversation ${conversation.id} - user deleted and other participant is blocked`
              );
              return null; // Exclude: blocked + deleted
            }
            // Otherwise, keep it in the listing even if user deleted it
          }
        }

        // For direct conversations, we need to preserve the other participant
        // even if they deleted the conversation (for display purposes)
        // But filter participants array for the response
        if (conversation.type === CONVERSATION_TYPE.DIRECT) {
          // Keep all participants in the conversation object for ConversationResource
          // ConversationResource will handle finding otherParticipant from all participants
          // But filter the participants array to only show non-deleted ones
          const allParticipants = conversation.participants;
          conversation.participants = allParticipants.filter((p: any) => p.deletedAt === null);
          // Store all participants (including deleted) for otherParticipant lookup
          conversation.allParticipants = allParticipants;
        } else {
          // For group conversations, filter participants normally
          conversation.participants = conversation.participants.filter(
            (p: any) => p.deletedAt === null
          );
        }

        return conversation;
      })
      .filter((conv: any) => conv !== null); // Remove null entries (excluded conversations)

    // Note: Total count is approximate after filtering
    // We filter out blocked+deleted conversations, so total may be less than the DB count
    // For accurate pagination, we'd need to apply the filter in the DB query,
    // but for simplicity, we return the filtered count
    const filteredTotal = filteredConversations.length;

    return {
      conversations: filteredConversations,
      total: filteredTotal,
    };
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(conversationId: number, userId: number): Promise<any | null> {
    // Verify user is a participant
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant || participant.deletedAt) {
      return null;
    }

    // Fetch conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lastMessage: {
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
            media: {
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        participants: {
          where: {
            deletedAt: null,
          },
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
        },
        creator: {
          select: {
            id: true,
            name: true,
            userName: true,
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return conversation;
  }

  /**
   * Update conversation (group settings)
   */
  async updateConversation(
    conversationId: number,
    userId: number,
    data: UpdateConversationData
  ): Promise<any> {
    // Verify user is admin
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant || participant.role !== PARTICIPANT_ROLE.ADMIN) {
      throw new Error('Only admins can update group settings');
    }

    // Update conversation
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
        image: data.image !== undefined ? data.image : undefined,
        imageStorage: data.imageStorage !== undefined ? data.imageStorage : undefined,
        updatedAt: new Date(),
      },
      include: {
        lastMessage: {
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
            media: {
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        participants: {
          where: {
            deletedAt: null,
          },
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
        },
        creator: {
          select: {
            id: true,
            name: true,
            userName: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Delete/leave conversation
   */
  async deleteOrLeaveConversation(
    conversationId: number,
    userId: number,
    deleteForUserId?: number
  ): Promise<void> {
    const targetUserId = deleteForUserId || userId;

    // Verify the participant exists before updating
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: targetUserId,
        },
      },
      select: {
        id: true,
        conversation: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!participant) {
      throw new Error('Participant not found');
    }

    const conversation = participant.conversation;

    if (conversation.type === CONVERSATION_TYPE.DIRECT) {
      // Soft delete for direct chat - delete for ME only
      // When A deletes, only A's participant record gets deletedAt set
      // B's participant record stays unchanged, so B still sees the conversation
      // Using update (not updateMany) with unique constraint ensures only ONE participant is updated
      await this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: targetUserId, // Only update THIS specific user's participant record
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // Check if all participants have deleted the conversation
      // If yes, also mark the conversation as deleted
      const allParticipants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId,
        },
        select: {
          deletedAt: true,
        },
      });

      const allDeleted =
        allParticipants.length > 0 && allParticipants.every(p => p.deletedAt !== null);

      if (allDeleted) {
        // All participants have deleted - mark conversation as deleted too
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            deletedAt: new Date(),
          },
        });
      }
    } else {
      // Leave group chat
      await this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: targetUserId,
          },
        },
        data: {
          leftAt: new Date(),
          deletedAt: new Date(),
        },
      });

      // Update participant count
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          participantCount: {
            decrement: 1,
          },
        },
      });
    }
  }
}
