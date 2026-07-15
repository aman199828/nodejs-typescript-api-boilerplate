/**
 * User Status Manager
 * Manages online/offline status with in-memory cache and smart debouncing
 * Prevents database overload from continuous socket emissions
 */

import { prisma } from '../../../lib/prisma';
import { RoomManager } from '../socket/rooms';

interface StatusCacheEntry {
  isOnline: boolean;
  lastSeenAt: Date | null;
  lastDbUpdate: Date;
  pendingUpdate: boolean;
}

export class UserStatusManager {
  private statusCache: Map<number, StatusCacheEntry> = new Map();
  private debounceTimers: Map<number, NodeJS.Timeout> = new Map();
  private updateQueue: Set<number> = new Set();
  private batchInterval: NodeJS.Timeout | null = null;
  private roomManager: RoomManager;

  // Configuration
  private readonly OFFLINE_DEBOUNCE_MS = 5000; // 5 seconds for offline
  private readonly ONLINE_DEBOUNCE_MS = 0; // Immediate for online
  private readonly BATCH_INTERVAL_MS = 30000; // 30 seconds batch processing

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
    this.startBatchProcessor();
  }

  /**
   * Check and update user status based on actual socket connections
   * Only updates database if status actually changed
   */
  async checkAndUpdateStatus(userId: number): Promise<void> {
    // Get actual status from RoomManager (source of truth)
    const actualIsOnline = this.roomManager.isUserOnline(userId);

    // Get cached status
    const cached = this.statusCache.get(userId);

    // If no cache entry, load from database
    if (!cached) {
      await this.loadStatusFromDb(userId);
      const updatedCache = this.statusCache.get(userId);
      if (!updatedCache) return;

      // Check again after loading
      if (updatedCache.isOnline !== actualIsOnline) {
        await this.updateStatus(userId, actualIsOnline);
      }
      return;
    }

    // Check if status changed
    if (cached.isOnline !== actualIsOnline) {
      console.log(
        `[StatusManager] Status changed for user ${userId}: ${cached.isOnline} → ${actualIsOnline}`
      );
      await this.updateStatus(userId, actualIsOnline);
    } else {
      // Status unchanged - no DB update needed
      // But we might still need to update lastSeenAt if user went offline recently
      if (!actualIsOnline && !cached.lastSeenAt) {
        // User is offline but lastSeenAt not set - update it
        await this.scheduleDbUpdate(userId, false);
      }
    }
  }

  /**
   * Update status in cache and schedule DB update
   */
  private async updateStatus(userId: number, isOnline: boolean): Promise<void> {
    const now = new Date();
    const cached = this.statusCache.get(userId) || {
      isOnline: false,
      lastSeenAt: null,
      lastDbUpdate: new Date(0),
      pendingUpdate: false,
    };

    // Update cache
    this.statusCache.set(userId, {
      isOnline,
      lastSeenAt: isOnline ? null : now, // Set lastSeenAt when going offline
      lastDbUpdate: cached.lastDbUpdate,
      pendingUpdate: true,
    });

    // Schedule DB update with appropriate debounce
    await this.scheduleDbUpdate(userId, isOnline);
  }

  /**
   * Schedule debounced database update
   */
  private async scheduleDbUpdate(userId: number, isOnline: boolean): Promise<void> {
    // Clear existing timer if any
    const existingTimer = this.debounceTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Add to update queue
    this.updateQueue.add(userId);

    // Debounce timing: immediate for online, 5s for offline
    const debounceMs = isOnline ? this.ONLINE_DEBOUNCE_MS : this.OFFLINE_DEBOUNCE_MS;

    if (debounceMs === 0) {
      // Immediate update for online
      await this.processDbUpdate(userId);
    } else {
      // Debounced update for offline
      const timer = setTimeout(async () => {
        await this.processDbUpdate(userId);
        this.debounceTimers.delete(userId);
      }, debounceMs);

      this.debounceTimers.set(userId, timer);
    }
  }

  /**
   * Process database update for a single user
   */
  private async processDbUpdate(userId: number): Promise<void> {
    const cached = this.statusCache.get(userId);
    if (!cached || !cached.pendingUpdate) {
      return;
    }

    try {
      // Check actual status again before updating (might have changed during debounce)
      const actualIsOnline = this.roomManager.isUserOnline(userId);

      // Only update if still matches cached status
      if (cached.isOnline === actualIsOnline) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            isOnline: cached.isOnline,
            lastSeenAt: cached.lastSeenAt,
          } as any,
        });

        // Update cache to mark as synced
        this.statusCache.set(userId, {
          ...cached,
          lastDbUpdate: new Date(),
          pendingUpdate: false,
        });

        console.log(
          `[StatusManager] ✅ DB updated for user ${userId}: isOnline=${cached.isOnline}, lastSeenAt=${cached.lastSeenAt?.toISOString() || 'null'}`
        );
      } else {
        // Status changed during debounce - cancel this update
        console.log(
          `[StatusManager] ⚠️ Status changed during debounce for user ${userId}, skipping DB update`
        );
        this.statusCache.set(userId, {
          ...cached,
          pendingUpdate: false,
        });
      }
    } catch (error) {
      console.error(`[StatusManager] ❌ Error updating DB for user ${userId}:`, error);
      // Keep pendingUpdate = true so it can be retried in batch
    } finally {
      this.updateQueue.delete(userId);
    }
  }

  /**
   * Load status from database into cache
   */
  private async loadStatusFromDb(userId: number): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isOnline: true,
          lastSeenAt: true,
        } as any,
      });

      if (user) {
        this.statusCache.set(userId, {
          isOnline: (user as any).isOnline ?? false,
          lastSeenAt: (user as any).lastSeenAt ? new Date((user as any).lastSeenAt) : null,
          lastDbUpdate: new Date(),
          pendingUpdate: false,
        });
      }
    } catch (error) {
      console.error(`[StatusManager] Error loading status from DB for user ${userId}:`, error);
      // Set default cache entry
      this.statusCache.set(userId, {
        isOnline: false,
        lastSeenAt: null,
        lastDbUpdate: new Date(0),
        pendingUpdate: false,
      });
    }
  }

  /**
   * Get current status (from cache or DB)
   */
  async getStatus(userId: number): Promise<{ isOnline: boolean; lastSeenAt: Date | null }> {
    let cached = this.statusCache.get(userId);

    if (!cached) {
      await this.loadStatusFromDb(userId);
      cached = this.statusCache.get(userId);
    }

    if (cached) {
      // Also check actual status from RoomManager (more accurate)
      const actualIsOnline = this.roomManager.isUserOnline(userId);

      // If different, update cache (but don't trigger DB update here)
      if (cached.isOnline !== actualIsOnline) {
        cached.isOnline = actualIsOnline;
        if (!actualIsOnline && !cached.lastSeenAt) {
          cached.lastSeenAt = new Date();
        }
      }

      return {
        isOnline: cached.isOnline,
        lastSeenAt: cached.lastSeenAt,
      };
    }

    // Fallback: check RoomManager directly
    const isOnline = this.roomManager.isUserOnline(userId);
    return {
      isOnline,
      lastSeenAt: isOnline ? null : new Date(),
    };
  }

  /**
   * Start batch processor for pending updates
   */
  private startBatchProcessor(): void {
    this.batchInterval = setInterval(async () => {
      if (this.updateQueue.size > 0) {
        console.log(`[StatusManager] Processing ${this.updateQueue.size} pending status updates`);
        const userIds = Array.from(this.updateQueue);

        // Process in parallel (but limit concurrency)
        const batchSize = 10;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          await Promise.all(batch.map(userId => this.processDbUpdate(userId)));
        }
      }
    }, this.BATCH_INTERVAL_MS);
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }

    // Clear all timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Process any remaining updates
    if (this.updateQueue.size > 0) {
      const userIds = Array.from(this.updateQueue);
      Promise.all(userIds.map(userId => this.processDbUpdate(userId))).catch(console.error);
    }
  }

  /**
   * Get cached status (fast, no DB query)
   */
  getCachedStatus(userId: number): { isOnline: boolean; lastSeenAt: Date | null } | null {
    const cached = this.statusCache.get(userId);
    if (!cached) return null;

    // Check actual status from RoomManager
    const actualIsOnline = this.roomManager.isUserOnline(userId);

    return {
      isOnline: actualIsOnline,
      lastSeenAt: cached.lastSeenAt,
    };
  }
}
