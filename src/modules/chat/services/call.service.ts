/**
 * Call Service
 * Provides business logic for call operations including busy status checks
 */

import { prisma } from '../../../lib/prisma';
import { CALL_STATUS } from '../constants/call.constants';

export interface ActiveCallInfo {
  callId: number;
  callType: number;
  withUserId: number;
  status: number;
  startedAt: Date;
}

export interface BusyStatusResult {
  isBusy: boolean;
  activeCall?: ActiveCallInfo;
}

export class CallService {
  /**
   * Check if a user is currently in an active call
   * @param userId - User ID to check
   * @returns Busy status and active call details if busy
   */
  async isUserBusy(userId: number): Promise<BusyStatusResult> {
    // Find active calls where user is either caller or receiver
    // Active = status is INITIATED (1) or ANSWERED (2), and not ended
    const activeCall = await prisma.callLog.findFirst({
      where: {
        OR: [{ callerId: userId }, { receiverId: userId }],
        status: {
          in: [CALL_STATUS.INITIATED, CALL_STATUS.ANSWERED],
        },
        endedAt: null,
        // Only consider calls initiated in last 5 minutes (prevent stale data)
        initiatedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000),
        },
      },
      orderBy: {
        initiatedAt: 'desc',
      },
      select: {
        id: true,
        callType: true,
        status: true,
        initiatedAt: true,
        callerId: true,
        receiverId: true,
      },
    });

    if (!activeCall) {
      return { isBusy: false };
    }

    // Determine the other participant
    const withUserId = activeCall.callerId === userId ? activeCall.receiverId : activeCall.callerId;

    return {
      isBusy: true,
      activeCall: {
        callId: activeCall.id,
        callType: activeCall.callType,
        withUserId,
        status: activeCall.status,
        startedAt: activeCall.initiatedAt,
      },
    };
  }
}
