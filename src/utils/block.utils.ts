import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Check if a user has blocked another user
 * @param blockerId - The user who might have blocked
 * @param blockedId - The user being checked
 * @returns true if blocked, false otherwise
 */
export async function isUserBlocked(
  blockerId: number | undefined | null,
  blockedId: number
): Promise<boolean> {
  if (!blockerId || blockerId === blockedId) {
    return false;
  }

  try {
    const block = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    return !!block;
  } catch (error) {
    console.error('Error checking block status:', error);
    return false;
  }
}

/**
 * Get list of users blocked by current user
 * @param blockerId - The user who blocked others
 * @returns Array of blocked user IDs
 */
export async function getBlockedUserIds(blockerId: number | undefined | null): Promise<number[]> {
  if (!blockerId) {
    return [];
  }

  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId },
      select: { blockedId: true },
    });

    return blocks.map(b => b.blockedId);
  } catch (error) {
    console.error('Error getting blocked user IDs:', error);
    return [];
  }
}

/**
 * Get list of users who blocked the current user
 * @param userId - The user who might be blocked by others
 * @returns Array of user IDs who blocked this user
 */
export async function getBlockedByUserIds(userId: number | undefined | null): Promise<number[]> {
  if (!userId) {
    return [];
  }

  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    });

    return blocks.map(b => b.blockerId);
  } catch (error) {
    console.error('Error getting blocked-by user IDs:', error);
    return [];
  }
}

/**
 * Get combined list of blocked users (both ways)
 * Returns users that either:
 * - Current user has blocked
 * - Have blocked current user
 *
 * @param userId - The current user ID
 * @returns Array of user IDs to hide
 */
export async function getMutualBlockedUserIds(
  userId: number | undefined | null
): Promise<number[]> {
  if (!userId) {
    return [];
  }

  try {
    const [blockedByMe, blockedMe] = await Promise.all([
      getBlockedUserIds(userId),
      getBlockedByUserIds(userId),
    ]);

    // Combine and deduplicate
    return [...new Set([...blockedByMe, ...blockedMe])];
  } catch (error) {
    console.error('Error getting mutual blocked user IDs:', error);
    return [];
  }
}

/**
 * Check multiple users for block status at once
 * @param blockerId - The user checking block status
 * @param userIds - Array of user IDs to check
 * @returns Map of userId => isBlocked boolean
 */
export async function checkMultipleBlocks(
  blockerId: number | undefined | null,
  userIds: number[]
): Promise<Map<number, boolean>> {
  const result = new Map<number, boolean>();

  // Initialize all as false
  userIds.forEach(id => result.set(id, false));

  if (!blockerId || userIds.length === 0) {
    return result;
  }

  try {
    const blocks = await prisma.userBlock.findMany({
      where: {
        blockerId,
        blockedId: { in: userIds },
      },
      select: { blockedId: true },
    });

    // Mark blocked users as true
    blocks.forEach(block => {
      result.set(block.blockedId, true);
    });

    return result;
  } catch (error) {
    console.error('Error checking multiple blocks:', error);
    return result;
  }
}
