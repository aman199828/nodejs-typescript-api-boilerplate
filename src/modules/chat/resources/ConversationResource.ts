/**
 * Conversation Resource
 * Transforms conversation data for API responses
 */

import { getFileUrlWithStorage } from '../../../utils/file.utils';
import { STORAGE_FOLDERS } from '../../../services/storage';
import { UserResource } from '../../../resources/UserResource';
import { MessageResource } from './MessageResource';
import { getUsersStatus } from '../utils/user-status.utils';

export class ConversationResource {
  /**
   * Transform a single conversation
   */
  static async transform(conversation: any, currentUserId: number): Promise<any> {
    // For direct conversations, use allParticipants (includes deleted) to find otherParticipant
    // This ensures we show the other participant even if they deleted the conversation
    const participantsForLookup = conversation.allParticipants || conversation.participants;

    // Get current user's participant record
    const currentUserParticipant = participantsForLookup?.find(
      (p: any) => p.userId === currentUserId
    );

    // Get other participant for direct chats (from all participants, including deleted ones)
    let otherParticipant = null;
    if (conversation.type === 1) {
      // CONVERSATION_TYPE.DIRECT
      otherParticipant = participantsForLookup?.find((p: any) => p.userId !== currentUserId);
    }

    // Generate presigned URLs
    let imageUrl = null;
    if (conversation.image && conversation.imageStorage === 's3') {
      imageUrl = await getFileUrlWithStorage(conversation.image, 's3', STORAGE_FOLDERS.CHAT);
    }

    // Transform last message using MessageResource for consistency (includes media)
    let lastMessage = null;
    if (conversation.lastMessage) {
      // Check if user deleted the conversation
      // If deletedAt is set, only show lastMessage if it was created AFTER deletion
      if (currentUserParticipant?.deletedAt) {
        const lastMessageDate = new Date(conversation.lastMessage.createdAt);
        const deletedAtDate = new Date(currentUserParticipant.deletedAt);

        // Only show lastMessage if it was created after user deleted the conversation
        if (lastMessageDate >= deletedAtDate) {
          // Last message is after deletion - show it (new message after clearing)
          const transformed = await MessageResource.transform(
            conversation.lastMessage,
            currentUserId
          );

          // Return minimal version for conversation list (but include media)
          lastMessage = {
            id: transformed.id,
            uuid: transformed.uuid,
            content: transformed.content,
            messageType: transformed.messageType,
            senderId: transformed.senderId,
            sender: transformed.sender,
            createdAt: transformed.createdAt,
            status: transformed.status,
            media: transformed.media || [],
            mediaUrl: transformed.mediaUrl, // First media for backward compatibility
          };
        }
        // Otherwise, lastMessage stays null (user cleared old messages)
      } else {
        // User didn't delete - show lastMessage normally
        const transformed = await MessageResource.transform(
          conversation.lastMessage,
          currentUserId
        );

        // Return minimal version for conversation list (but include media)
        lastMessage = {
          id: transformed.id,
          uuid: transformed.uuid,
          content: transformed.content,
          messageType: transformed.messageType,
          senderId: transformed.senderId,
          sender: transformed.sender,
          createdAt: transformed.createdAt,
          status: transformed.status,
          media: transformed.media || [],
          mediaUrl: transformed.mediaUrl, // First media for backward compatibility
        };
      }
    }

    // Get status for all participants
    const participantUserIds = (conversation.participants || []).map((p: any) => p.user.id);
    const participantsStatus = await getUsersStatus(participantUserIds, currentUserId);

    // Transform participants
    const participants = await Promise.all(
      (conversation.participants || []).map(async (p: any) => {
        const status = participantsStatus.get(p.user.id);
        return {
          id: p.user.id,
          name: p.user.name,
          userName: p.user.userName,
          profileFile: p.user.profileFile
            ? await getFileUrlWithStorage(
                p.user.profileFile,
                p.user.profileFileStorage || 'local',
                STORAGE_FOLDERS.PROFILE_FILE
              )
            : null,
          role: p.role,
          isMuted: p.isMuted,
          unreadCount: p.unreadCount,
          lastReadAt: p.lastReadAt,
          lastReadMessageId: p.lastReadMessageId,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          isOnline: status?.isOnline ?? null,
          lastSeenAt: status?.lastSeenAt?.toISOString() ?? null,
        };
      })
    );

    // Transform other participant for direct chats
    let transformedOtherParticipant = null;
    if (otherParticipant) {
      // Get status for other participant
      const otherParticipantStatus = await getUsersStatus(
        [otherParticipant.user.id],
        currentUserId
      );
      const status = otherParticipantStatus.get(otherParticipant.user.id);

      transformedOtherParticipant = {
        id: otherParticipant.user.id,
        name: otherParticipant.user.name,
        userName: otherParticipant.user.userName,
        profileFile: otherParticipant.user.profileFile
          ? await getFileUrlWithStorage(
              otherParticipant.user.profileFile,
              otherParticipant.user.profileFileStorage || 'local',
              STORAGE_FOLDERS.PROFILE_FILE
            )
          : null,
        isOnline: status?.isOnline ?? null,
        lastSeenAt: status?.lastSeenAt?.toISOString() ?? null,
      };
    }

    return {
      id: conversation.id,
      uuid: conversation.uuid,
      type: conversation.type,
      name: conversation.name,
      description: conversation.description,
      image: conversation.image,
      imageUrl,
      createdById: conversation.createdById,
      // If lastMessage is filtered out (user cleared old messages), set these to null
      lastMessageId: lastMessage ? conversation.lastMessageId : null,
      lastMessageAt: lastMessage ? conversation.lastMessageAt : null,
      participantCount: conversation.participantCount,
      maxParticipants: conversation.maxParticipants,
      isActive: conversation.isActive,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessage,
      participants,
      otherParticipant: transformedOtherParticipant,
      currentUserParticipant: currentUserParticipant
        ? {
            role: currentUserParticipant.role,
            isMuted: currentUserParticipant.isMuted,
            unreadCount: currentUserParticipant.unreadCount,
            lastReadAt: currentUserParticipant.lastReadAt,
            lastReadMessageId: currentUserParticipant.lastReadMessageId,
            joinedAt: currentUserParticipant.joinedAt,
          }
        : undefined,
      unreadCount: currentUserParticipant?.unreadCount || 0,
      isMuted: currentUserParticipant?.isMuted || false,
    };
  }

  /**
   * Transform a collection of conversations
   */
  static async collection(conversations: any[], currentUserId: number): Promise<any[]> {
    return Promise.all(conversations.map(conv => this.transform(conv, currentUserId)));
  }
}
