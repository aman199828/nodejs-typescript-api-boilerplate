/**
 * User Status Utilities
 * Helper functions for getting user online/offline status in APIs
 */

import { prisma } from '../../../lib/prisma';
import { ChatSocketServer } from '../socket/server';

/**
 * Get user online status with privacy settings check
 * @param userId - User ID to check
 * @param viewerId - User ID of the person viewing (for privacy checks)
 * @returns Status object with isOnline and lastSeenAt, or null if privacy settings hide it
 */
export async function getUserStatus(
  userId: number,
  viewerId?: number
): Promise<{ isOnline: boolean | null; lastSeenAt: Date | null } | null> {
  try {
    // Get user privacy settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        showOnlineStatus: true,
        showLastSeen: true,
        isOnline: true,
        lastSeenAt: true,
      } as any,
    });

    if (!user) {
      return null;
    }

    // Check privacy settings
    const showOnlineStatus = (user as any).showOnlineStatus ?? true;
    const showLastSeen = (user as any).showLastSeen ?? true;

    // If viewing own profile, always show status
    const isOwnProfile = viewerId === userId;

    // Get status from database or RoomManager
    let isOnline: boolean | null = null;
    let lastSeenAt: Date | null = null;

    // Try to get from UserStatusManager (fast, cached)
    const socketServer = ChatSocketServer.getInstance();
    if (socketServer) {
      const statusManager = socketServer.getUserStatusManager();
      if (statusManager) {
        const cached = statusManager.getCachedStatus(userId);
        if (cached) {
          isOnline = cached.isOnline;
          lastSeenAt = cached.lastSeenAt;
        } else {
          // Fallback: get from RoomManager
          const roomManager = socketServer.getRoomManager();
          isOnline = roomManager.isUserOnline(userId);
          lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
        }
      } else {
        // Fallback: get from RoomManager
        const roomManager = socketServer.getRoomManager();
        isOnline = roomManager.isUserOnline(userId);
        lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
      }
    } else {
      // No socket server - get from database only
      isOnline = (user as any).isOnline ?? false;
      lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
    }

    // Apply privacy settings
    if (!isOwnProfile) {
      if (!showOnlineStatus) {
        isOnline = null; // Hide online status
      }
      if (!showLastSeen) {
        lastSeenAt = null; // Hide last seen
      }
    }

    return {
      isOnline,
      lastSeenAt,
    };
  } catch (error) {
    console.error(`[UserStatusUtils] Error getting status for user ${userId}:`, error);
    return null;
  }
}

/**
 * Get status for multiple users (batch operation)
 */
export async function getUsersStatus(
  userIds: number[],
  viewerId?: number
): Promise<Map<number, { isOnline: boolean | null; lastSeenAt: Date | null } | null>> {
  const statusMap = new Map<number, { isOnline: boolean | null; lastSeenAt: Date | null } | null>();

  // Get all users' privacy settings in one query
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      showOnlineStatus: true,
      showLastSeen: true,
      isOnline: true,
      lastSeenAt: true,
    } as any,
  });

  const socketServer = ChatSocketServer.getInstance();
  const roomManager = socketServer?.getRoomManager();
  const statusManager = socketServer?.getUserStatusManager();

  for (const user of users) {
    const userId = (user as any).id as number;
    const showOnlineStatus = (user as any).showOnlineStatus ?? true;
    const showLastSeen = (user as any).showLastSeen ?? true;
    const isOwnProfile = viewerId !== undefined && viewerId === userId;

    let isOnline: boolean | null = null;
    let lastSeenAt: Date | null = null;

    // Get from cache or RoomManager
    if (statusManager) {
      const cached = statusManager.getCachedStatus(userId);
      if (cached) {
        isOnline = cached.isOnline;
        lastSeenAt = cached.lastSeenAt;
      } else if (roomManager) {
        isOnline = roomManager.isUserOnline(userId);
        lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
      }
    } else if (roomManager) {
      isOnline = roomManager.isUserOnline(userId);
      lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
    } else {
      isOnline = (user as any).isOnline ?? false;
      lastSeenAt = (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null;
    }

    // Apply privacy settings
    if (!isOwnProfile) {
      if (!showOnlineStatus) {
        isOnline = null;
      }
      if (!showLastSeen) {
        lastSeenAt = null;
      }
    }

    statusMap.set(userId, { isOnline, lastSeenAt });
  }

  return statusMap;
}
