/**
 * Call Status Service
 * Manages active call status for users
 */

interface ActiveCall {
  channelName: string;
  isVideoCall: boolean;
  otherUserId: number;
  startTime: Date;
}

export class CallStatusService {
  private activeCalls: Map<number, ActiveCall>;

  constructor() {
    this.activeCalls = new Map();
  }

  /**
   * Store that a user is in a call
   */
  setUserInCall(
    userId: number,
    channelName: string,
    isVideoCall: boolean,
    otherUserId: number
  ): void {
    this.activeCalls.set(userId, {
      channelName,
      isVideoCall,
      otherUserId,
      startTime: new Date(),
    });
  }

  /**
   * Remove call status for a user
   */
  removeUserCall(userId: number): void {
    this.activeCalls.delete(userId);
  }

  /**
   * Get call status for a user
   */
  getUserCallStatus(userId: number): ActiveCall | null {
    return this.activeCalls.get(userId) || null;
  }

  /**
   * Check if a user is in a call
   */
  isUserInCall(userId: number): boolean {
    return this.activeCalls.has(userId);
  }

  /**
   * Get all active calls (for debugging/admin purposes)
   */
  getAllActiveCalls(): Map<number, ActiveCall> {
    return new Map(this.activeCalls);
  }

  /**
   * Clear all active calls (for cleanup/testing)
   */
  clearAll(): void {
    this.activeCalls.clear();
  }
}

// Export singleton instance
export const callStatusService = new CallStatusService();
