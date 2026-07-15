/**
 * Socket.IO Authentication Middleware
 * Validates JWT token exactly like mobileAuth middleware
 */

import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { AuthenticatedSocket } from './types';
import { prisma } from '../../../lib/prisma';
import { SERVER_EVENTS, ErrorResponse } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Check if token is blacklisted
 */
const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const blacklistedToken = await prisma.tokenBlacklist.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
  });
  return !!blacklistedToken;
};

/**
 * Socket authentication middleware
 * Validates JWT token exactly like mobileAuth
 */
export const socketAuth = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    // Get token from handshake (can be in auth.token or query.token)
    const token = socket.handshake.auth?.token || (socket.handshake.query?.token as string);

    if (!token) {
      return next(new Error('Invalid or expired token'));
    }

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return next(new Error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return next(new Error('Invalid or expired token'));
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        roleId: true,
        isActive: true,
        isAdmin: true,
        name: true,
      },
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user information to socket
    socket.userId = user.id;
    socket.user = {
      id: user.id,
      email: user.email || '',
      name: user.name || undefined,
    };

    console.log(`[Socket Auth] User authenticated: ${user.id} (${user.email})`);
    next();
  } catch (error) {
    console.error('[Socket Auth] Error:', error);
    next(new Error('Authentication failed'));
  }
};

/**
 * Middleware wrapper for Socket.IO
 * Applies authentication to all connections
 */
export const applySocketAuth = (io: Server) => {
  io.use(socketAuth);
};

/**
 * Helper to get authenticated user from socket
 */
export const getSocketUser = (socket: AuthenticatedSocket) => {
  if (!socket.userId || !socket.user) {
    throw new Error('Socket not authenticated');
  }
  return {
    userId: socket.userId,
    user: socket.user,
  };
};

/**
 * Helper to emit error to socket
 */
export const emitError = (socket: AuthenticatedSocket, error: string, code?: string) => {
  const errorResponse: ErrorResponse = {
    error,
    code,
    message: error,
  };
  socket.emit(SERVER_EVENTS.ERROR, errorResponse);
};
