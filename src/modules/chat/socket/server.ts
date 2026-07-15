/**
 * Socket.IO Server for Chat Module
 * Flutter + Apache safe version
 */

import { Server as HTTPServer } from 'http';
import { Server, ServerOptions } from 'socket.io';
import { applySocketAuth, getSocketUser } from './auth.middleware';
import { RoomManager } from './rooms';
import { SocketHandlers } from './handlers';
import { AuthenticatedSocket, CLIENT_EVENTS, SERVER_EVENTS } from './types';
import { prisma } from '../../../lib/prisma';

export interface ChatSocketConfig {
  socketPath?: string;
  corsOrigin?: string | string[];
  maxParticipants?: number;
  messageMaxLength?: number;
}

export class ChatSocketServer {
  private io: Server;
  private roomManager: RoomManager;
  private handlers: SocketHandlers;
  private config: ChatSocketConfig;
  private static instance: ChatSocketServer | null = null;
  private userStatusManager: any; // UserStatusManager - will import dynamically

  /**
   * Expose Socket.IO instance
   */
  public getIO(): Server {
    return this.io;
  }

  constructor(httpServer: HTTPServer, config: ChatSocketConfig = {}) {
    this.config = {
      socketPath: config.socketPath || '/socket',
      corsOrigin: config.corsOrigin || '*',
      maxParticipants: config.maxParticipants || 100,
      messageMaxLength: config.messageMaxLength || 5000,
    };

    /**
     * 🔥 SOCKET.IO OPTIONS (IMPORTANT)
     * - websocket ONLY (fixes Flutter timeout)
     * - no EIO3
     * - mobile-safe timeouts
     */
    const serverOptions: Partial<ServerOptions> = {
      path: this.config.socketPath,
      cors: {
        origin: this.config.corsOrigin,
        credentials: true,
      },
      transports: ['websocket'], // 🔥 CRITICAL
      allowUpgrades: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
    };

    this.io = new Server(httpServer, serverOptions);

    /**
     * 🔍 ENGINE.IO ERROR VISIBILITY (VERY IMPORTANT)
     */
    this.io.engine.on('connection_error', err => {
      console.error('[ENGINE.IO ERROR]', {
        code: err.code,
        message: err.message,
        context: err.context,
      });
    });

    this.roomManager = new RoomManager(this.io);
    this.handlers = new SocketHandlers(this.roomManager, this.io);

    // Initialize UserStatusManager
    const { UserStatusManager } = require('../services/user-status.service');
    this.userStatusManager = new UserStatusManager(this.roomManager);

    // Store instance for access from handlers
    ChatSocketServer.instance = this;

    /**
     * 🔐 AUTH MIDDLEWARE
     * MUST run before `connection`
     */
    applySocketAuth(this.io);

    /**
     * 🔌 CONNECTION HANDLER
     */
    this.setupConnectionHandler();

    console.log(`✅ [Chat Socket] Initialized on path: ${this.config.socketPath}`);
  }

  /**
   * Handle new connections
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      /**
       * 🛑 SAFETY CHECK
       * If auth middleware failed, disconnect immediately
       */
      if (!socket.user) {
        console.warn('[Chat Socket] Unauthorized socket rejected');
        socket.disconnect(true);
        return;
      }

      const { userId, user } = getSocketUser(socket);

      console.log(`[Chat Socket] User connected: ${userId} (${user.email}) | Socket: ${socket.id}`);

      /**
       * 👤 Presence
       */
      this.roomManager.joinUserPresence(socket, userId);

      /**
       * ✅ Notify client that auth + connection succeeded
       */
      socket.emit(SERVER_EVENTS.CONNECTED, {
        userId,
        socketId: socket.id,
      });

      /**
       * 📡 Broadcast online status and update database
       */
      console.log(`[Socket] 👤 User ${userId} connected - broadcasting ONLINE status`);
      // Update status in database (immediate for online)
      this.userStatusManager.checkAndUpdateStatus(userId).catch((err: any) => {
        console.error(`[Socket] Error updating status for user ${userId}:`, err);
      });
      // Broadcast to other users
      this.broadcastUserOnlineStatus(userId, true);

      /**
       * 📥 Register event handlers
       */
      this.setupEventHandlers(socket);

      /**
       * ❌ Disconnect handler
       */
      socket.on('disconnect', reason => {
        console.log(`[Chat Socket] User disconnected: ${userId} | Reason: ${reason}`);

        const userSockets = this.roomManager.getUserSockets(userId);
        const stillOnline = userSockets.size > 1;

        if (!stillOnline) {
          console.log(
            `[Socket] 👤 User ${userId} disconnected (no other sockets) - broadcasting OFFLINE status`
          );
          // Update status in database (debounced for offline)
          this.userStatusManager.checkAndUpdateStatus(userId).catch((err: any) => {
            console.error(`[Socket] Error updating status for user ${userId}:`, err);
          });
          // Broadcast to other users
          this.broadcastUserOnlineStatus(userId, false);
        } else {
          console.log(
            `[Socket] 👤 User ${userId} disconnected but still has ${userSockets.size - 1} other socket(s) - NOT broadcasting offline status`
          );
        }

        this.roomManager.leaveUserPresence(socket, userId);
      });
    });
  }

  /**
   * Register all socket event handlers
   */
  private setupEventHandlers(socket: AuthenticatedSocket): void {
    socket.on(CLIENT_EVENTS.JOIN_CONVERSATION, payload =>
      this.handlers.handleJoinConversation(socket, payload)
    );

    socket.on(CLIENT_EVENTS.LEAVE_CONVERSATION, payload =>
      this.handlers.handleLeaveConversation(socket, payload)
    );

    socket.on(CLIENT_EVENTS.SEND_MESSAGE, payload =>
      this.handlers.handleSendMessage(socket, payload)
    );

    socket.on(CLIENT_EVENTS.MARK_READ, payload => this.handlers.handleMarkRead(socket, payload));

    socket.on(CLIENT_EVENTS.TYPING_START, payload =>
      this.handlers.handleTypingStart(socket, payload)
    );

    socket.on(CLIENT_EVENTS.TYPING_STOP, payload =>
      this.handlers.handleTypingStop(socket, payload)
    );

    socket.on(CLIENT_EVENTS.REACT_TO_MESSAGE, payload =>
      this.handlers.handleReactToMessage(socket, payload)
    );

    socket.on(CLIENT_EVENTS.REMOVE_REACTION, payload =>
      this.handlers.handleRemoveReaction(socket, payload)
    );

    socket.on(CLIENT_EVENTS.ACCEPT_MESSAGE_REQUEST, payload =>
      this.handlers.handleAcceptMessageRequest(socket, payload)
    );

    socket.on(CLIENT_EVENTS.DECLINE_MESSAGE_REQUEST, payload =>
      this.handlers.handleDeclineMessageRequest(socket, payload)
    );

    socket.on(CLIENT_EVENTS.CREATE_GROUP_CHAT, payload =>
      this.handlers.handleCreateGroupChat(socket, payload)
    );

    socket.on(CLIENT_EVENTS.ADD_PARTICIPANTS, payload =>
      this.handlers.handleAddParticipants(socket, payload)
    );

    socket.on(CLIENT_EVENTS.REMOVE_PARTICIPANT, payload =>
      this.handlers.handleRemoveParticipant(socket, payload)
    );

    socket.on(CLIENT_EVENTS.LEAVE_GROUP, payload =>
      this.handlers.handleLeaveGroup(socket, payload)
    );

    socket.on(CLIENT_EVENTS.UPDATE_GROUP_SETTINGS, payload =>
      this.handlers.handleUpdateGroupSettings(socket, payload)
    );

    socket.on(CLIENT_EVENTS.CALL_STARTED, payload =>
      this.handlers.handleCallStarted(socket, payload)
    );

    socket.on(CLIENT_EVENTS.CALL_ENDED, payload => this.handlers.handleCallEnded(socket, payload));

    socket.on(CLIENT_EVENTS.CHECK_CALL_STATUS, payload =>
      this.handlers.handleCheckCallStatus(socket, payload)
    );

    // Handle user status updates from mobile app
    socket.on(CLIENT_EVENTS.USER_STATUS, payload =>
      this.handlers.handleUserStatus(socket, payload)
    );

    // Also handle direct user_online and user_offline events from mobile (for backward compatibility)
    socket.on('user_online', payload => {
      console.log(`[Socket] 👤 Received "user_online" event from client socket ${socket.id}`);
      console.log(`[Socket] 👤 Received payload:`, JSON.stringify(payload, null, 2));
      this.handlers.handleUserStatus(socket, { ...payload, isOnline: true });
    });

    socket.on('user_offline', payload => {
      console.log(`[Socket] 👤 Received "user_offline" event from client socket ${socket.id}`);
      console.log(`[Socket] 👤 Received payload:`, JSON.stringify(payload, null, 2));
      this.handlers.handleUserStatus(socket, { ...payload, isOnline: false });
    });
  }

  /**
   * Broadcast online/offline presence
   * Private method used internally for connect/disconnect events
   */
  private async broadcastUserOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    await this.broadcastUserStatus(userId, isOnline);
  }

  /**
   * Public method to broadcast user status to all relevant users
   * Can be called from controllers or anywhere else
   *
   * @param userId - User ID whose status changed
   * @param isOnline - Whether user is online (true) or offline (false)
   * @param broadcastToAll - If true, broadcasts to all connected users. If false (default), only broadcasts to users in conversations with this user
   */
  public async broadcastUserStatus(
    userId: number,
    isOnline: boolean,
    broadcastToAll: boolean = false
  ): Promise<void> {
    const payload = {
      userId,
      isOnline,
      lastSeen: isOnline ? undefined : new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    const eventName = isOnline ? SERVER_EVENTS.USER_ONLINE : SERVER_EVENTS.USER_OFFLINE;

    if (broadcastToAll) {
      // Broadcast to all connected users
      this.roomManager.broadcastToAll(eventName, payload);
      console.log(`[Socket] 👤 Emitting "${eventName}" event to ALL connected users`);
      console.log(`[Socket] 👤 Payload:`, JSON.stringify(payload, null, 2));
      return;
    }

    // Broadcast only to users who are in conversations with this user
    // Include all conversations, even if user deleted them (deletedAt is set)
    // We'll filter recipients later to only notify users who haven't deleted
    const conversations = await prisma.conversationParticipant.findMany({
      where: {
        userId,
        // Removed deletedAt: null filter - include all conversations
        // This ensures status updates reach other participants even if this user deleted the conversation
      },
      select: {
        conversationId: true,
      },
    });

    if (conversations.length === 0) {
      console.log(`[Socket] User ${userId} has no conversations, skipping status broadcast`);
      console.log(
        `[Socket] This is normal for new users - status will be broadcasted once they have conversations`
      );
      return;
    }

    const notifiedUsers = new Set<number>();
    const conversationDetails: Array<{ conversationId: number; participants: number[] }> = [];

    for (const { conversationId } of conversations) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            where: {
              userId: { not: userId },
              // Removed deletedAt: null filter - notify all participants regardless of deletion status
              // Online/offline status is a real-time event that should work even if user deleted the conversation
            },
            select: { userId: true },
          },
        },
      });

      if (!conversation) continue;

      const participantIds: number[] = [];
      for (const participant of conversation.participants) {
        // Avoid duplicate notifications if user is in multiple conversations
        if (!notifiedUsers.has(participant.userId)) {
          const recipientPresenceRoomName = `user:${participant.userId}`;
          const recipientPresenceSockets = this.roomManager.getUserSockets(participant.userId);

          this.roomManager.broadcastToUser(participant.userId, eventName, payload);

          notifiedUsers.add(participant.userId);
          participantIds.push(participant.userId);

          console.log(
            `[Socket] 👤 Emitting "${eventName}" event to user ${participant.userId} presence room "${recipientPresenceRoomName}" (${recipientPresenceSockets.size} socket(s))`
          );
          console.log(`[Socket] 👤 Payload:`, JSON.stringify(payload, null, 2));
        }
      }

      if (participantIds.length > 0) {
        conversationDetails.push({ conversationId, participants: participantIds });
      }
    }

    console.log(
      `[Socket] 👤 User ${userId} ${isOnline ? 'ONLINE' : 'OFFLINE'} status broadcasted to ${notifiedUsers.size} unique user(s) across ${conversationDetails.length} conversation(s)`
    );
    if (conversationDetails.length > 0) {
      console.log(
        `[Socket] 👤 Status broadcast details:`,
        conversationDetails
          .map(c => `Conv ${c.conversationId}: [${c.participants.join(', ')}]`)
          .join(', ')
      );
    }
  }

  /**
   * Expose room manager
   */
  public getRoomManager(): RoomManager {
    return this.roomManager;
  }

  /**
   * Expose user status manager
   */
  public getUserStatusManager(): any {
    return this.userStatusManager;
  }

  /**
   * Get instance (for handlers to access broadcastUserStatus)
   */
  public static getInstance(): ChatSocketServer | null {
    return ChatSocketServer.instance;
  }
}
