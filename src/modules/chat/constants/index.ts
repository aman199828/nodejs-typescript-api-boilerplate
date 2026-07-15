/**
 * Chat Module Constants
 * Central export for all chat-related constants
 */

// Message constants
export {
  MESSAGE_STATUS,
  MESSAGE_STATUS_LABELS,
  MESSAGE_TYPE,
  MESSAGE_TYPE_LABELS,
  getMessageStatusLabel,
  isValidMessageStatus,
  getMessageTypeLabel,
  isValidMessageType,
  type MessageStatusId,
  type MessageTypeId,
} from './message.constants';

// Conversation constants
export {
  CONVERSATION_TYPE,
  CONVERSATION_TYPE_LABELS,
  PARTICIPANT_ROLE,
  PARTICIPANT_ROLE_LABELS,
  MESSAGE_REQUEST_STATUS,
  MESSAGE_REQUEST_STATUS_LABELS,
  getConversationTypeLabel,
  getParticipantRoleLabel,
  getMessageRequestStatusLabel,
  isValidConversationType,
  isValidParticipantRole,
  isValidMessageRequestStatus,
  type ConversationTypeId,
  type ParticipantRoleId,
  type MessageRequestStatusId,
} from './conversation.constants';

// Call constants
export {
  CALL_TYPE,
  CALL_TYPE_LABELS,
  CALL_STATUS,
  CALL_STATUS_LABELS,
  getCallTypeLabel,
  isValidCallType,
  getCallStatusLabel,
  isValidCallStatus,
  type CallTypeId,
  type CallStatusId,
} from './call.constants';
