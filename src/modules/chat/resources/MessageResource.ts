/**
 * Message Resource
 * Transforms message data for API responses
 */

import { getFileUrlWithStorage } from '../../../utils/file.utils';
import { STORAGE_FOLDERS } from '../../../services/storage';
import { UserResource } from '../../../resources/UserResource';
import { S3StorageProvider } from '../../../services/storage/s3.storage';
import { STORAGE_TYPES } from '../../../constants/storage.constants';

export class MessageResource {
  /**
   * Extract S3 key from full S3 URL
   * Example: https://bucket.s3.region.amazonaws.com/public/uploads/chat/2/images/file.png
   * Returns: public/uploads/chat/2/images/file.png
   */
  private static extractS3KeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      let s3Key = urlObj.pathname;

      // Remove leading slash
      if (s3Key.startsWith('/')) {
        s3Key = s3Key.substring(1);
      }

      return s3Key || null;
    } catch (error) {
      console.error('[MessageResource] Failed to extract S3 key from URL:', url, error);
      return null;
    }
  }

  /**
   * Convert full S3 URL to presigned URL
   */
  private static async convertS3UrlToPresigned(fullUrl: string): Promise<string> {
    try {
      const s3Key = this.extractS3KeyFromUrl(fullUrl);
      if (!s3Key) {
        // If we can't extract the key, return original URL
        return fullUrl;
      }

      // Generate presigned URL using S3 storage provider
      const storage = new S3StorageProvider();
      return await storage.getUrl(s3Key);
    } catch (error) {
      console.error('[MessageResource] Failed to convert S3 URL to presigned:', fullUrl, error);
      // If conversion fails, return original URL
      return fullUrl;
    }
  }
  /**
   * Transform a single message (full details)
   */
  static async transform(message: any, currentUserId: number): Promise<any> {
    // Generate presigned URLs for media
    let mediaUrl = message.mediaUrl;
    let thumbnailUrl = message.thumbnailUrl;

    // Generate presigned URLs for media
    // Database now stores S3 keys (not full URLs), so we always build presigned URLs
    if (message.mediaUrl) {
      // If it's a full URL (backward compatibility for old records), extract key first
      if (message.mediaUrl.startsWith('http')) {
        const s3Key = this.extractS3KeyFromUrl(message.mediaUrl);
        if (s3Key) {
          // Generate presigned URL from extracted key
          const storageType = message.mediaStorage === 'local' ? 'local' : 's3';
          mediaUrl = await getFileUrlWithStorage(s3Key, storageType, STORAGE_FOLDERS.CHAT);
        } else {
          mediaUrl = message.mediaUrl; // Fallback to original if extraction fails
        }
      } else {
        // It's already an S3 key, generate presigned URL
        const storageType = message.mediaStorage === 'local' ? 'local' : 's3';
        mediaUrl = await getFileUrlWithStorage(message.mediaUrl, storageType, STORAGE_FOLDERS.CHAT);
      }

      // Handle thumbnail URL
      if (message.thumbnailUrl) {
        if (message.thumbnailUrl.startsWith('http')) {
          // Extract key from full URL (backward compatibility)
          const s3Key = this.extractS3KeyFromUrl(message.thumbnailUrl);
          if (s3Key) {
            const storageType = message.mediaStorage === 'local' ? 'local' : 's3';
            thumbnailUrl = await getFileUrlWithStorage(s3Key, storageType, STORAGE_FOLDERS.CHAT);
          } else {
            thumbnailUrl = message.thumbnailUrl; // Fallback
          }
        } else {
          // It's already an S3 key, generate presigned URL
          const storageType = message.mediaStorage === 'local' ? 'local' : 's3';
          thumbnailUrl = await getFileUrlWithStorage(
            message.thumbnailUrl,
            storageType,
            STORAGE_FOLDERS.CHAT
          );
        }
      }
    }

    // Determine if message is deleted for current user
    const isDeletedForCurrentUser =
      message.isDeleted &&
      (message.deletedForUserId === null || // Deleted for everyone
        message.deletedForUserId === currentUserId); // Deleted specifically for this user

    // Transform sender
    let sender = null;
    if (message.sender) {
      try {
        sender = await UserResource.minimal(message.sender);
      } catch (error) {
        console.error('[MessageResource] Error transforming sender:', error);
        // Fallback to basic sender info
        sender = {
          id: message.sender.id,
          name: message.sender.name,
          userName: message.sender.userName,
          profileFile: message.sender.profileFile,
        };
      }
    }

    // Transform replyTo
    let replyTo = null;
    if (message.replyTo) {
      let replySender = null;
      if (message.replyTo.sender) {
        try {
          replySender = await UserResource.minimal(message.replyTo.sender);
        } catch (error) {
          console.error('[MessageResource] Error transforming replyTo sender:', error);
          replySender = {
            id: message.replyTo.sender.id,
            name: message.replyTo.sender.name,
            userName: message.replyTo.sender.userName,
            profileFile: message.replyTo.sender.profileFile,
          };
        }
      }
      replyTo = {
        id: message.replyTo.id,
        content: message.replyTo.content,
        messageType: message.replyTo.messageType,
        senderId: message.replyTo.senderId,
        sender: replySender,
      };
    }

    // Transform reactions
    const reactions = (message.reactions || []).map((r: any) => ({
      id: r.id,
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt,
    }));

    // Transform read receipts
    const readReceipts = (message.readReceipts || []).map((rr: any) => ({
      id: rr.id,
      userId: rr.userId,
      readAt: rr.readAt,
    }));

    // Transform media array from MessageMedia records
    let mediaArray: any[] = [];
    if (message.media && Array.isArray(message.media) && message.media.length > 0) {
      mediaArray = await Promise.all(
        message.media
          .sort((a: any, b: any) => a.order - b.order) // Sort by order
          .map(async (item: any) => {
            let itemMediaUrl = item.mediaUrl;
            let itemThumbnailUrl = item.thumbnailUrl;

            // Generate presigned URLs for media items
            // Database now stores S3 keys (not full URLs), so we always build presigned URLs
            if (item.mediaUrl) {
              // If it's a full URL (backward compatibility for old records), extract key first
              if (item.mediaUrl.startsWith('http')) {
                const s3Key = MessageResource.extractS3KeyFromUrl(item.mediaUrl);
                if (s3Key) {
                  // Generate presigned URL from extracted key
                  const storageType = item.mediaStorage === 'local' ? 'local' : 's3';
                  itemMediaUrl = await getFileUrlWithStorage(
                    s3Key,
                    storageType,
                    STORAGE_FOLDERS.CHAT
                  );
                } else {
                  itemMediaUrl = item.mediaUrl; // Fallback to original if extraction fails
                }
              } else {
                // It's already an S3 key, generate presigned URL
                const storageType = item.mediaStorage === 'local' ? 'local' : 's3';
                itemMediaUrl = await getFileUrlWithStorage(
                  item.mediaUrl,
                  storageType,
                  STORAGE_FOLDERS.CHAT
                );
              }

              // Handle thumbnail URL
              if (item.thumbnailUrl) {
                if (item.thumbnailUrl.startsWith('http')) {
                  // Extract key from full URL (backward compatibility)
                  const s3Key = MessageResource.extractS3KeyFromUrl(item.thumbnailUrl);
                  if (s3Key) {
                    const storageType = item.mediaStorage === 'local' ? 'local' : 's3';
                    itemThumbnailUrl = await getFileUrlWithStorage(
                      s3Key,
                      storageType,
                      STORAGE_FOLDERS.CHAT
                    );
                  } else {
                    itemThumbnailUrl = item.thumbnailUrl; // Fallback
                  }
                } else {
                  // It's already an S3 key, generate presigned URL
                  const storageType = item.mediaStorage === 'local' ? 'local' : 's3';
                  itemThumbnailUrl = await getFileUrlWithStorage(
                    item.thumbnailUrl,
                    storageType,
                    STORAGE_FOLDERS.CHAT
                  );
                }
              }
            }

            return {
              id: item.id,
              mediaUrl: isDeletedForCurrentUser ? null : itemMediaUrl,
              thumbnailUrl: isDeletedForCurrentUser ? null : itemThumbnailUrl,
              fileName: item.fileName,
              fileSize: item.fileSize,
              mimeType: item.mimeType,
              mediaType: item.mediaType,
              duration: item.duration,
              order: item.order,
            };
          })
      );
    }

    return {
      id: message.id,
      uuid: message.uuid || null, // Can be null for backward compatibility (will be populated after migration)
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender,
      content: isDeletedForCurrentUser ? null : message.content,
      messageType: message.messageType,
      mediaUrl: isDeletedForCurrentUser ? null : mediaUrl,
      thumbnailUrl: isDeletedForCurrentUser ? null : thumbnailUrl,
      fileSize: message.fileSize,
      fileName: message.fileName,
      mimeType: message.mimeType,
      replyToId: message.replyToId,
      replyTo,
      storyId: message.storyId,
      sharedPostId: message.sharedPostId,
      sharedClipId: message.sharedClipId,
      sharedUserId: message.sharedUserId,
      sharedUser: message.sharedUser ? await UserResource.minimal(message.sharedUser) : null,
      sharedLocation: message.sharedLocation,
      status: message.status,
      readAt: message.readAt,
      readByUserId: message.readByUserId,
      isDisappearing: message.isDisappearing,
      expiresAt: message.expiresAt,
      viewedAt: message.viewedAt,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      isDeleted: message.isDeleted,
      deletedAt: message.deletedAt,
      deletedForUserId: message.deletedForUserId,
      message_time: message.message_time || message.createdAt, // NEW: UTC timestamp (fallback to createdAt)
      createdAt: message.createdAt, // Keep for backward compatibility
      updatedAt: message.updatedAt,
      reactions,
      readReceipts,
      media: isDeletedForCurrentUser ? [] : mediaArray,
    };
  }

  /**
   * Transform a minimal message (for last message preview in conversations)
   */
  static async minimal(message: any): Promise<any> {
    const sender = message.sender ? await UserResource.minimal(message.sender) : null;

    return {
      id: message.id,
      uuid: message.uuid,
      content: message.content,
      messageType: message.messageType,
      senderId: message.senderId,
      sender,
      createdAt: message.createdAt,
      status: message.status,
    };
  }

  /**
   * Transform a collection of messages
   */
  static async collection(messages: any[], currentUserId: number): Promise<any[]> {
    return Promise.all(messages.map(msg => this.transform(msg, currentUserId)));
  }
}
