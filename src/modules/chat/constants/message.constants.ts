/**
 * Message Status Constants
 * Used for message delivery and read status tracking
 */

export const MESSAGE_STATUS = {
  SENT: 1, // Message sent from sender's device (not yet delivered)
  DELIVERED: 2, // Message delivered to recipient's device/server
  READ: 3, // Message read by recipient (for direct messages)
} as const;

export const MESSAGE_STATUS_LABELS = {
  [MESSAGE_STATUS.SENT]: 'SENT',
  [MESSAGE_STATUS.DELIVERED]: 'DELIVERED',
  [MESSAGE_STATUS.READ]: 'READ',
} as const;

export type MessageStatusId = (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

/**
 * Message Type Constants
 * Used to identify the type of message content
 */
export const MESSAGE_TYPE = {
  TEXT: 1, // Plain text message
  IMAGE: 2, // Image file
  VIDEO: 3, // Video file
  AUDIO: 4, // Audio/voice message
  FILE: 5, // Generic file (PDF, DOC, etc.)
  STORY_REPLY: 6, // Reply to a story
  DISAPPEARING: 7, // Disappearing message (auto-deletes after viewing)
  POST_SHARE: 8, // Sharing a post
  CLIP_SHARE: 9, // Sharing a clip
  PROFILE_SHARE: 10, // Sharing a user profile
  HASHTAG_SHARE: 11, // Sharing a hashtag
  LOCATION_SHARE: 12, // Sharing a location
} as const;

export const MESSAGE_TYPE_LABELS = {
  [MESSAGE_TYPE.TEXT]: 'TEXT',
  [MESSAGE_TYPE.IMAGE]: 'IMAGE',
  [MESSAGE_TYPE.VIDEO]: 'VIDEO',
  [MESSAGE_TYPE.AUDIO]: 'AUDIO',
  [MESSAGE_TYPE.FILE]: 'FILE',
  [MESSAGE_TYPE.STORY_REPLY]: 'STORY_REPLY',
  [MESSAGE_TYPE.DISAPPEARING]: 'DISAPPEARING',
  [MESSAGE_TYPE.POST_SHARE]: 'POST_SHARE',
  [MESSAGE_TYPE.CLIP_SHARE]: 'CLIP_SHARE',
  [MESSAGE_TYPE.PROFILE_SHARE]: 'PROFILE_SHARE',
  [MESSAGE_TYPE.HASHTAG_SHARE]: 'HASHTAG_SHARE',
  [MESSAGE_TYPE.LOCATION_SHARE]: 'LOCATION_SHARE',
} as const;

export type MessageTypeId = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

/**
 * Helper function to get status label
 */
export function getMessageStatusLabel(status: MessageStatusId): string {
  return MESSAGE_STATUS_LABELS[status] || 'UNKNOWN';
}

/**
 * Helper function to check if status is valid
 */
export function isValidMessageStatus(status: number): status is MessageStatusId {
  return Object.values(MESSAGE_STATUS).includes(status as MessageStatusId);
}

/**
 * Helper function to get message type label
 */
export function getMessageTypeLabel(type: MessageTypeId): string {
  return MESSAGE_TYPE_LABELS[type] || 'UNKNOWN';
}

/**
 * Helper function to check if message type is valid
 */
export function isValidMessageType(type: number): type is MessageTypeId {
  return Object.values(MESSAGE_TYPE).includes(type as MessageTypeId);
}
