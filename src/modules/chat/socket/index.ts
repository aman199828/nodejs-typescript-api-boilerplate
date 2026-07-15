/**
 * Chat Socket Module - Main Export
 */

export { ChatSocketServer, type ChatSocketConfig } from './server';
export { RoomManager } from './rooms';
export { SocketHandlers } from './handlers';
export { socketAuth, applySocketAuth, getSocketUser, emitError } from './auth.middleware';
export * from './types';
