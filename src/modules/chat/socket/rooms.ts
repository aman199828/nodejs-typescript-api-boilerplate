/**
 * Socket Room Management
 * Handles conversation rooms and user presence rooms
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, SOCKET_ROOMS } from './types';

/**
 * Room Manager - Manages socket room memberships
 */
export class RoomManager {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Join a conversation room
   */
  joinConversation(socket: AuthenticatedSocket, conversationId: number): void {
    const roomName = SOCKET_ROOMS.conversation(conversationId);
    socket.join(roomName);
    console.log(`[Room] User ${socket.userId} joined conversation ${conversationId}`);
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(socket: AuthenticatedSocket, conversationId: number): void {
    const roomName = SOCKET_ROOMS.conversation(conversationId);
    socket.leave(roomName);
    console.log(`[Room] User ${socket.userId} left conversation ${conversationId}`);
  }

  /**
   * Join user presence room (for online status tracking)
   */
  joinUserPresence(socket: AuthenticatedSocket, userId: number): void {
    const roomName = SOCKET_ROOMS.user(userId);
    socket.join(roomName);
    console.log(`[Room] Socket ${socket.id} joined user presence room for user ${userId}`);
  }

  /**
   * Leave user presence room
   */
  leaveUserPresence(socket: AuthenticatedSocket, userId: number): void {
    const roomName = SOCKET_ROOMS.user(userId);
    socket.leave(roomName);
    console.log(`[Room] Socket ${socket.id} left user presence room for user ${userId}`);
  }

  /**
   * Get all sockets in a conversation room
   */
  getConversationSockets(conversationId: number): Set<string> {
    const roomName = SOCKET_ROOMS.conversation(conversationId);
    return this.io.sockets.adapter.rooms.get(roomName) || new Set();
  }

  /**
   * Get all sockets for a user (multiple devices)
   */
  getUserSockets(userId: number): Set<string> {
    const roomName = SOCKET_ROOMS.user(userId);
    return this.io.sockets.adapter.rooms.get(roomName) || new Set();
  }

  /**
   * Check if user is online (has any active socket connections)
   */
  isUserOnline(userId: number): boolean {
    const sockets = this.getUserSockets(userId);
    return sockets.size > 0;
  }

  /**
   * Broadcast to conversation room (excluding sender)
   */
  broadcastToConversation(
    conversationId: number,
    event: string,
    data: any,
    excludeSocketId?: string
  ): void {
    const roomName = SOCKET_ROOMS.conversation(conversationId);
    if (excludeSocketId) {
      this.io.to(roomName).except(excludeSocketId).emit(event, data);
    } else {
      this.io.to(roomName).emit(event, data);
    }
  }

  /**
   * Broadcast to user presence room (all user's devices)
   */
  broadcastToUser(userId: number, event: string, data: any): void {
    const roomName = SOCKET_ROOMS.user(userId);
    this.io.to(roomName).emit(event, data);
  }

  /**
   * Broadcast to all connected sockets
   */
  broadcastToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get room size (number of sockets in room)
   */
  getRoomSize(roomName: string): number {
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  /**
   * Get socket by socket ID
   */
  getSocketById(socketId: string): AuthenticatedSocket | undefined {
    return this.io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
  }
}
