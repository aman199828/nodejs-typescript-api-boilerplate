/**
 * Conversation Type Constants
 * Used to identify the type of conversation
 */

export const CONVERSATION_TYPE = {
  DIRECT: 1, // One-on-one conversation
  GROUP: 2, // Group chat with multiple participants
} as const;

export const CONVERSATION_TYPE_LABELS = {
  [CONVERSATION_TYPE.DIRECT]: 'DIRECT',
  [CONVERSATION_TYPE.GROUP]: 'GROUP',
} as const;

export type ConversationTypeId = (typeof CONVERSATION_TYPE)[keyof typeof CONVERSATION_TYPE];

/**
 * Conversation Participant Role Constants
 * Used to define participant roles in group chats
 */

export const PARTICIPANT_ROLE = {
  ADMIN: 1, // Group admin (can manage group settings, add/remove members)
  MODERATOR: 2, // Group moderator (can moderate messages, remove members)
  MEMBER: 3, // Regular member (can send messages)
} as const;

export const PARTICIPANT_ROLE_LABELS = {
  [PARTICIPANT_ROLE.ADMIN]: 'ADMIN',
  [PARTICIPANT_ROLE.MODERATOR]: 'MODERATOR',
  [PARTICIPANT_ROLE.MEMBER]: 'MEMBER',
} as const;

export type ParticipantRoleId = (typeof PARTICIPANT_ROLE)[keyof typeof PARTICIPANT_ROLE];

/**
 * Message Request Status Constants
 * Used to track message request status
 */

export const MESSAGE_REQUEST_STATUS = {
  PENDING: 1, // Request sent, waiting for response
  ACCEPTED: 2, // Request accepted, conversation created
  DECLINED: 3, // Request declined by recipient
  DELETED: 4, // Request deleted
} as const;

export const MESSAGE_REQUEST_STATUS_LABELS = {
  [MESSAGE_REQUEST_STATUS.PENDING]: 'PENDING',
  [MESSAGE_REQUEST_STATUS.ACCEPTED]: 'ACCEPTED',
  [MESSAGE_REQUEST_STATUS.DECLINED]: 'DECLINED',
  [MESSAGE_REQUEST_STATUS.DELETED]: 'DELETED',
} as const;

export type MessageRequestStatusId =
  (typeof MESSAGE_REQUEST_STATUS)[keyof typeof MESSAGE_REQUEST_STATUS];

/**
 * Helper function to get conversation type label
 */
export function getConversationTypeLabel(type: ConversationTypeId): string {
  return CONVERSATION_TYPE_LABELS[type] || 'UNKNOWN';
}

/**
 * Helper function to check if conversation type is valid
 */
export function isValidConversationType(type: number): type is ConversationTypeId {
  return Object.values(CONVERSATION_TYPE).includes(type as ConversationTypeId);
}

/**
 * Helper function to get participant role label
 */
export function getParticipantRoleLabel(role: ParticipantRoleId): string {
  return PARTICIPANT_ROLE_LABELS[role] || 'UNKNOWN';
}

/**
 * Helper function to check if participant role is valid
 */
export function isValidParticipantRole(role: number): role is ParticipantRoleId {
  return Object.values(PARTICIPANT_ROLE).includes(role as ParticipantRoleId);
}

/**
 * Helper function to get message request status label
 */
export function getMessageRequestStatusLabel(status: MessageRequestStatusId): string {
  return MESSAGE_REQUEST_STATUS_LABELS[status] || 'UNKNOWN';
}

/**
 * Helper function to check if message request status is valid
 */
export function isValidMessageRequestStatus(status: number): status is MessageRequestStatusId {
  return Object.values(MESSAGE_REQUEST_STATUS).includes(status as MessageRequestStatusId);
}
