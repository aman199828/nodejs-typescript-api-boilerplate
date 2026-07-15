/**
 * Socket.IO Types for Chat Module
 */

import { Socket as SocketIOSocket } from 'socket.io';

/**
 * Authenticated Socket - Socket with user information attached
 */
export interface AuthenticatedSocket extends SocketIOSocket {
  userId?: number;
  user?: {
    id: number;
    email: string;
    name?: string;
  };
}

/**
 * Socket Event Payloads - Client to Server
 */

// Connection Events
export interface ConnectPayload {
  token?: string;
}

// Conversation Events
export interface JoinConversationPayload {
  conversationId: number;
}

export interface LeaveConversationPayload {
  conversationId: number;
}

// Message Events
export interface MediaItem {
  mediaUrl: string; // Full S3 URL
  thumbnailUrl?: string; // Full S3 URL for thumbnail
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  mediaType?: string; // "image", "video", "audio", "file"
  duration?: number; // For video/audio in seconds
}

export interface SendMessagePayload {
  conversationId?: number; // Optional: if not provided, recipientId must be provided to auto-create conversation
  recipientId?: number; // Optional: required if conversationId is not provided (for first message)
  content?: string;
  messageType?: number; // Optional: auto-derived from media if not provided. Required for special types (TEXT, STORY_REPLY, POST_SHARE, etc.)
  media?: MediaItem[]; // Array of media files (can be any combination: images, videos, files, etc.)
  replyToId?: number;
  storyId?: number;
  isDisappearing?: boolean;
  expiresAt?: string;
  // Content sharing
  sharedPostId?: number;
  sharedClipId?: number;
  sharedUserId?: number;
  sharedLocation?: string;
  // NEW: UUID and message_time for deduplication and timezone handling
  uuid?: string; // 12-character UUID format (e.g., "a1b2c3d4-e5f6")
  message_time?: string; // UTC timestamp in ISO8601 format (e.g., "2024-01-15T10:30:00.000Z")
}

export interface MarkReadPayload {
  conversationId: number;
  messageIds: number[];
}

export interface ViewDisappearingMessagePayload {
  messageId: number;
}

export interface EditMessagePayload {
  messageId: number;
  content: string;
}

export interface DeleteMessagePayload {
  messageId: number;
  deleteFor?: number; // User ID for "delete for me", null for "delete for everyone"
}

// Typing Events
export interface TypingStartPayload {
  conversationId: number;
}

export interface TypingStopPayload {
  conversationId: number;
}

// Reaction Events
export interface ReactToMessagePayload {
  messageId: number;
  emoji: string;
}

export interface RemoveReactionPayload {
  messageId: number;
}

// Message Request Events
export interface AcceptMessageRequestPayload {
  requestId: number;
}

export interface DeclineMessageRequestPayload {
  requestId: number;
}

// Group Chat Events
export interface CreateGroupChatPayload {
  name?: string;
  description?: string;
  image?: string;
  participantIds: number[];
}

export interface AddParticipantsPayload {
  conversationId: number;
  userIds: number[];
}

export interface RemoveParticipantPayload {
  conversationId: number;
  userId: number;
}

export interface LeaveGroupPayload {
  conversationId: number;
}

export interface UpdateGroupSettingsPayload {
  conversationId: number;
  name?: string;
  description?: string;
  image?: string;
}

// Call Status Events
export interface CallStartedPayload {
  userId: number;
  channelName: string;
  isVideoCall: boolean;
  otherUserId: number;
  timestamp?: string;
}

export interface CallEndedPayload {
  userId: number;
  channelName: string;
  timestamp?: string;
}

export interface CheckCallStatusPayload {
  userId: number;
}

export interface UserStatusPayload {
  userId?: number; // Optional - will use socket userId if not provided
  isOnline: boolean;
  timestamp?: string;
}

/**
 * Socket Event Responses - Server to Client
 */

export interface MessageSentResponse {
  messageId: number;
  uuid: string | null; // NEW: UUID for deduplication (echo back from client or server-generated, can be null during migration)
  conversationId: number; // Conversation ID (useful when auto-created via recipientId)
  tempId?: string;
  status: number; // 1=sent, 2=delivered, 3=read
}

export interface MessageDeliveredResponse {
  messageId: number;
  conversationId: number;
}

export interface MessageReadResponse {
  messageId: number;
  conversationId: number;
  readAt: string;
}

export interface TypingIndicatorResponse {
  conversationId: number;
  userId: number;
  userName?: string;
  isTyping: boolean;
}

export interface OnlineStatusResponse {
  userId: number;
  isOnline: boolean;
  lastSeen?: string;
}

export interface UserCallStatusResponse {
  userId: number;
  isInCall: boolean;
  channelName?: string | null;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  message?: string;
}

/**
 * Socket Room Names
 */
export const SOCKET_ROOMS = {
  conversation: (conversationId: number) => `conversation:${conversationId}`,
  user: (userId: number) => `user:${userId}`,
} as const;

/**
 * Socket Event Names - Client to Server
 */
export const CLIENT_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Conversation
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',

  // Messages
  SEND_MESSAGE: 'send_message',
  MARK_READ: 'mark_read',
  VIEW_DISAPPEARING_MESSAGE: 'view_disappearing_message',
  EDIT_MESSAGE: 'edit_message',
  DELETE_MESSAGE: 'delete_message',

  // Typing
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',

  // Reactions
  REACT_TO_MESSAGE: 'react_to_message',
  REMOVE_REACTION: 'remove_reaction',

  // Message Requests
  ACCEPT_MESSAGE_REQUEST: 'accept_message_request',
  DECLINE_MESSAGE_REQUEST: 'decline_message_request',

  // Group Chats
  CREATE_GROUP_CHAT: 'create_group_chat',
  ADD_PARTICIPANTS: 'add_participants',
  REMOVE_PARTICIPANT: 'remove_participant',
  LEAVE_GROUP: 'leave_group',
  UPDATE_GROUP_SETTINGS: 'update_group_settings',

  // Call Status
  CALL_STARTED: 'call_started',
  CALL_ENDED: 'call_ended',
  CHECK_CALL_STATUS: 'check_call_status',

  // User Status
  USER_STATUS: 'user_status',
} as const;

/**
 * Socket Event Names - Server to Client
 */
export const SERVER_EVENTS = {
  // Connection
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',

  // Messages
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_DELIVERED: 'message_delivered',
  MESSAGE_READ: 'message_read',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',

  // Typing
  TYPING_INDICATOR: 'typing_indicator',

  // Presence
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  USER_LAST_SEEN: 'user_last_seen',

  // Reactions
  MESSAGE_REACTED: 'message_reacted',
  REACTION_REMOVED: 'reaction_removed',

  // Message Requests
  MESSAGE_REQUEST_RECEIVED: 'message_request_received',
  MESSAGE_REQUEST_ACCEPTED: 'message_request_accepted',
  MESSAGE_REQUEST_DECLINED: 'message_request_declined',

  // Group Chats
  GROUP_CREATED: 'group_created',
  PARTICIPANT_ADDED: 'participant_added',
  PARTICIPANT_REMOVED: 'participant_removed',
  PARTICIPANT_LEFT: 'participant_left',
  GROUP_SETTINGS_UPDATED: 'group_settings_updated',

  // Disappearing Messages
  DISAPPEARING_MESSAGE_VIEWED: 'disappearing_message_viewed',

  // Call Status
  USER_CALL_STATUS: 'user_call_status',

  // Notifications
  NOTIFICATION_RECEIVED: 'notification_received',
} as const;
