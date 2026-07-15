/**
 * Chat Module - Prisma Client
 *
 * This module uses the main Prisma client from the root project.
 * The chat models should be added to the main `prisma/schema.prisma` file.
 *
 * Import the main Prisma client and use it for chat operations:
 *
 * ```typescript
 * import { prisma } from '../../lib/prisma';
 *
 * const conversations = await prisma.conversation.findMany();
 * ```
 */

// Re-export types from the main Prisma client
// These will be available after you add the chat models to your main schema
export type {
  Conversation,
  ConversationParticipant,
  Message,
  MessageRequest,
  MessageReaction,
  MessageReadReceipt,
} from '@prisma/client';
