/**
 * Call Controller
 * Handles REST API endpoints for call notifications
 */

import { Request, Response } from 'express';
import { ApiResponse } from '../../../resources/ApiResponse';
import { NotificationService } from '../../notifications/services/notification.service';
import { prisma } from '../../../lib/prisma';
import {
  CALL_TYPE,
  CALL_STATUS,
  CALL_STATUS_STRING,
  CALL_STATUS_LABELS,
  isValidCallType,
  isValidCallStatus,
  getCallStatusLabel,
} from '../constants/call.constants';
import { CallService } from '../services/call.service';
// import { agoraService, AgoraService } from '../../../services/agora/agora.service';
// import { callStatusService } from '../services/call-status.service'; // Commented out - not using in-memory storage

export class CallController {
  private notificationService: NotificationService;
  private callService: CallService;

  constructor() {
    this.notificationService = new NotificationService();
    this.callService = new CallService();
  }

  /**
   * Send Call Notification
   * POST /api/v1/mobile/chat/calls/notify
   *
   * Sends a push notification to the receiver when a call is initiated.
   * Frontend handles all call logic, this just sends the notification.
   */
  sendCallNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { receiverId, conversationId, callType } = req.body;

      // Validation
      if (!receiverId) {
        res.status(400).json(ApiResponse.error('receiverId is required', 400));
        return;
      }

      // Validate callType (should be 1 for AUDIO or 2 for VIDEO)
      const parsedCallType = callType ? parseInt(callType) : null;
      if (!parsedCallType || !isValidCallType(parsedCallType)) {
        res.status(400).json(ApiResponse.error('callType must be 1 (AUDIO) or 2 (VIDEO)', 400));
        return;
      }

      if (receiverId === userId) {
        res.status(400).json(ApiResponse.error('Cannot call yourself', 400));
        return;
      }

      // Check if receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (!receiver) {
        res.status(404).json(ApiResponse.error('Receiver not found', 404));
        return;
      }

      // Get caller info
      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (!caller) {
        res.status(404).json(ApiResponse.error('Caller not found', 404));
        return;
      }

      // Check if receiver is busy (in an active call)
      const busyCheck = await this.callService.isUserBusy(receiverId);
      if (busyCheck.isBusy && busyCheck.activeCall) {
        res.status(409).json(
          ApiResponse.error('User is currently on another call', 409, {
            isBusy: true,
            receiverId,
            activeCall: {
              callId: busyCheck.activeCall.callId,
              callType: busyCheck.activeCall.callType,
              withUserId: busyCheck.activeCall.withUserId,
              status: busyCheck.activeCall.status,
              startedAt: busyCheck.activeCall.startedAt,
            },
          })
        );
        return;
      }

      // Optional: Check if receiver has blocked caller (implement based on your blocking system)
      // const isBlocked = await checkIfBlocked(receiverId, userId);
      // if (isBlocked) {
      //   res.status(403).json(ApiResponse.error('Cannot call this user', 403));
      //   return;
      // }

      // Store call in database for call logs
      const call = await prisma.callLog.create({
        data: {
          callerId: userId,
          receiverId: receiverId,
          callType: parsedCallType,
          conversationId: conversationId ? parseInt(conversationId) : undefined,
          status: CALL_STATUS.INITIATED,
        },
      });
      const callId = call.id;

      // Send push notification
      console.log(
        `[CallController] 📞 Sending incoming call notification - callerId: ${userId}, receiverId: ${receiverId}, callId: ${callId}`
      );
      await this.notificationService
        .sendCallNotification(
          receiverId,
          userId,
          {
            callType: parsedCallType,
            conversationId: conversationId ? parseInt(conversationId) : undefined,
            callId, // Optional
          },
          caller
        )
        .then(() => {
          console.log(
            `[CallController] ✅ Incoming call notification sent successfully to receiver ${receiverId}`
          );
        })
        .catch(error => {
          console.error(
            `[CallController] ❌ Error sending incoming call notification to receiver ${receiverId}:`,
            error
          );
          // Don't fail call initiation if notification fails
        });

      res.status(200).json(
        ApiResponse.success(
          {
            callId,
            notificationSent: true,
          },
          'Call notification sent successfully'
        )
      );
    } catch (error: any) {
      console.error('[CallController] Error sending call notification:', error);
      res.status(500).json(ApiResponse.serverError('Failed to send call notification'));
    }
  };

  /**
   * Get Call Logs
   * GET /api/v1/mobile/chat/calls/logs
   *
   * Retrieves call history for the authenticated user.
   * Query params: skip, limit, status, callType
   */
  getCallLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const status = req.query.status ? parseInt(req.query.status as string) : undefined;
      const callType = req.query.callType ? parseInt(req.query.callType as string) : undefined;

      // Validate status if provided
      if (status !== undefined && !isValidCallStatus(status)) {
        res.status(400).json(ApiResponse.error('Invalid status', 400));
        return;
      }

      // Validate callType if provided
      if (callType !== undefined && !isValidCallType(callType)) {
        res.status(400).json(ApiResponse.error('Invalid callType', 400));
        return;
      }

      // Build where clause
      const where: any = {
        OR: [{ callerId: userId }, { receiverId: userId }],
      };

      if (status !== undefined) {
        where.status = status;
      }

      if (callType !== undefined) {
        where.callType = callType;
      }

      // Get call logs
      const [callLogs, total] = await Promise.all([
        prisma.callLog.findMany({
          where,
          include: {
            caller: {
              select: {
                id: true,
                name: true,
                userName: true,
                profileFile: true,
                profileFileStorage: true,
              },
            },
            receiver: {
              select: {
                id: true,
                name: true,
                userName: true,
                profileFile: true,
                profileFileStorage: true,
              },
            },
            conversation: {
              select: {
                id: true,
                uuid: true,
                type: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.callLog.count({ where }),
      ]);

      res.status(200).json(
        ApiResponse.success(
          {
            callLogs,
            pagination: {
              skip,
              limit,
              total,
              hasMore: skip + limit < total,
            },
          },
          'Call logs retrieved successfully'
        )
      );
    } catch (error: any) {
      console.error('[CallController] Error getting call logs:', error);
      res.status(500).json(ApiResponse.serverError('Failed to get call logs'));
    }
  };

  /**
   * Update Call Status (Simple)
   * POST /api/v1/mobile/call/status
   *
   * Updates call status with integer status values:
   * - 3 (REJECTED) - Call was rejected by receiver
   * - 4 (ENDED) - Call ended (after being answered)
   * - 5 (MISSED) - Call was not answered (timeout or missed)
   *
   * Body: { callId, status (integer), duration? }
   */
  updateCallStatusSimple = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { callId, status, duration } = req.body;

      // Validation
      if (!callId) {
        res.status(400).json(ApiResponse.error('callId is required', 400));
        return;
      }

      if (status === undefined || status === null) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              `status is required and must be one of: ${CALL_STATUS.REJECTED} (rejected), ${CALL_STATUS.ENDED} (ended), ${CALL_STATUS.MISSED} (missed)`,
              400
            )
          );
        return;
      }

      // Parse status as integer
      const statusInt = typeof status === 'string' ? parseInt(status, 10) : status;

      if (isNaN(statusInt) || typeof statusInt !== 'number') {
        res
          .status(400)
          .json(
            ApiResponse.error(
              `status must be an integer. Valid values: ${CALL_STATUS.REJECTED} (rejected), ${CALL_STATUS.ENDED} (ended), ${CALL_STATUS.MISSED} (missed)`,
              400
            )
          );
        return;
      }

      // Validate status is one of the allowed values
      let internalStatus: number;
      if (statusInt === CALL_STATUS.REJECTED) {
        internalStatus = CALL_STATUS.REJECTED;
      } else if (statusInt === CALL_STATUS.ENDED) {
        internalStatus = CALL_STATUS.ENDED;
      } else if (statusInt === CALL_STATUS.MISSED) {
        internalStatus = CALL_STATUS.MISSED;
      } else {
        res
          .status(400)
          .json(
            ApiResponse.error(
              `Invalid status. Must be one of: ${CALL_STATUS.REJECTED} (rejected), ${CALL_STATUS.ENDED} (ended), ${CALL_STATUS.MISSED} (missed)`,
              400
            )
          );
        return;
      }

      const callLogId = parseInt(callId);
      if (!callLogId || isNaN(callLogId)) {
        res.status(400).json(ApiResponse.error('Invalid callId', 400));
        return;
      }

      // Find call log
      const callLog = await prisma.callLog.findUnique({
        where: { id: callLogId },
      });

      if (!callLog) {
        res.status(404).json(ApiResponse.error('Call log not found', 404));
        return;
      }

      // Verify user is either caller or receiver
      if (callLog.callerId !== userId && callLog.receiverId !== userId) {
        res.status(403).json(ApiResponse.error('You are not authorized to update this call', 403));
        return;
      }

      // Build update data
      const updateData: any = {
        status: internalStatus,
      };

      // Set timestamps and duration based on status
      if (internalStatus === CALL_STATUS.ENDED) {
        /**
         * When call ends, we store:
         * 1. status = CALL_STATUS.ENDED (4)
         * 2. endedAt = Current timestamp (when call ended)
         * 3. duration = Call duration in seconds
         *    - If call was answered: Calculated from answeredAt to endedAt
         *    - If duration provided: Uses provided duration
         *    - If call wasn't answered but duration provided: Uses provided duration
         */
        if (!callLog.endedAt) {
          updateData.endedAt = new Date();
        }
        // Calculate duration if call was answered
        if (callLog.answeredAt) {
          const endTime = updateData.endedAt || callLog.endedAt || new Date();
          const durationSeconds = Math.floor(
            (endTime.getTime() - callLog.answeredAt.getTime()) / 1000
          );
          updateData.duration = duration || durationSeconds;
        } else if (duration) {
          // If duration provided but call wasn't answered, use provided duration
          updateData.duration = duration;
        }
      } else if (internalStatus === CALL_STATUS.REJECTED || internalStatus === CALL_STATUS.MISSED) {
        /**
         * When call is rejected or not answered, we store:
         * 1. status = CALL_STATUS.REJECTED (3) or CALL_STATUS.MISSED (5)
         * 2. endedAt = Current timestamp (when call was rejected/missed)
         * 3. duration = null (no duration for rejected/missed calls)
         */
        if (!callLog.endedAt) {
          updateData.endedAt = new Date();
        }
      }

      // Update call log
      const updatedCallLog = await prisma.callLog.update({
        where: { id: callLogId },
        data: updateData,
        include: {
          caller: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          conversation: {
            select: {
              id: true,
              uuid: true,
              type: true,
              name: true,
            },
          },
        },
      });

      // Remove call status from memory if call ended or rejected
      // if (internalStatus === CALL_STATUS.ENDED || internalStatus === CALL_STATUS.REJECTED) {
      //   callStatusService.removeUserCall(callLog.callerId);
      //   callStatusService.removeUserCall(callLog.receiverId);
      // }

      // Send rejection notification to caller if call was rejected
      console.log(
        `[CallController] 🔍 Checking rejection notification - internalStatus: ${internalStatus}, CALL_STATUS.REJECTED: ${CALL_STATUS.REJECTED}, Match: ${internalStatus === CALL_STATUS.REJECTED}`
      );
      if (internalStatus === CALL_STATUS.REJECTED) {
        console.log(
          `[CallController] 📞 Call ${callLogId} rejected - sending rejection notification to caller ${callLog.callerId}, receiver ${callLog.receiverId}`
        );
        console.log(
          `[CallController] 📞 Rejection notification data - callType: ${callLog.callType}, conversationId: ${callLog.conversationId}, callId: ${updatedCallLog.id}`
        );

        try {
          await this.notificationService.sendCallRejectionNotification(
            callLog.callerId,
            callLog.receiverId,
            {
              callType: callLog.callType,
              conversationId: callLog.conversationId || undefined,
              callId: updatedCallLog.id,
            }
          );
          console.log(
            `[CallController] ✅ Rejection notification sent successfully to caller ${callLog.callerId}`
          );
        } catch (error: any) {
          console.error(
            `[CallController] ❌ Error sending rejection notification to caller ${callLog.callerId}:`,
            error
          );
          console.error(`[CallController] ❌ Error stack:`, error?.stack);
          // Don't fail call rejection if notification fails
        }
      } else {
        console.log(
          `[CallController] ⏭️ Skipping rejection notification - status is ${internalStatus}, not REJECTED (${CALL_STATUS.REJECTED})`
        );
      }

      res.status(200).json(
        ApiResponse.success(
          {
            callId: updatedCallLog.id,
            status: internalStatus,
            message: `Call status updated to ${internalStatus}`,
          },
          'Call status updated successfully'
        )
      );
    } catch (error: any) {
      console.error('[CallController] Error updating call status:', error);
      res.status(500).json(ApiResponse.serverError('Failed to update call status'));
    }
  };

  /**
   * Update Call Status (Legacy)
   * PATCH /api/v1/mobile/chat/calls/:callId/status
   *
   * Updates the status of a call (answered, rejected, ended, missed).
   * Body: { status, duration? }
   */
  updateCallStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const callIdParam = Array.isArray(req.params.callId)
        ? req.params.callId[0]
        : req.params.callId;
      const callId = parseInt(callIdParam, 10);
      const { status, duration } = req.body;

      if (!callId || isNaN(callId)) {
        res.status(400).json(ApiResponse.error('Invalid callId', 400));
        return;
      }

      if (!status || !isValidCallStatus(status)) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              'Valid status is required (2=ANSWERED, 3=REJECTED, 4=ENDED, 5=MISSED)',
              400
            )
          );
        return;
      }

      // Find call log
      const callLog = await prisma.callLog.findUnique({
        where: { id: callId },
      });

      if (!callLog) {
        res.status(404).json(ApiResponse.error('Call log not found', 404));
        return;
      }

      // Verify user is either caller or receiver
      if (callLog.callerId !== userId && callLog.receiverId !== userId) {
        res.status(403).json(ApiResponse.error('You are not authorized to update this call', 403));
        return;
      }

      // Build update data
      const updateData: any = {
        status,
      };

      // Set timestamps based on status
      if (status === CALL_STATUS.ANSWERED && !callLog.answeredAt) {
        updateData.answeredAt = new Date();
      } else if (status === CALL_STATUS.ENDED) {
        if (!callLog.endedAt) {
          updateData.endedAt = new Date();
        }
        // Calculate duration if not provided
        if (callLog.answeredAt) {
          const endTime = updateData.endedAt || callLog.endedAt || new Date();
          const durationSeconds = Math.floor(
            (endTime.getTime() - callLog.answeredAt.getTime()) / 1000
          );
          updateData.duration = duration || durationSeconds;
        }
      } else if (status === CALL_STATUS.REJECTED || status === CALL_STATUS.MISSED) {
        // For rejected/missed calls, we can optionally set endedAt
        if (!callLog.endedAt) {
          updateData.endedAt = new Date();
        }
      }

      // Update call log
      const updatedCallLog = await prisma.callLog.update({
        where: { id: callId },
        data: updateData,
        include: {
          caller: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          conversation: {
            select: {
              id: true,
              uuid: true,
              type: true,
              name: true,
            },
          },
        },
      });

      res.status(200).json(ApiResponse.success(updatedCallLog, 'Call status updated successfully'));
    } catch (error: any) {
      console.error('[CallController] Error updating call status:', error);
      res.status(500).json(ApiResponse.serverError('Failed to update call status'));
    }
  };

  /**
   * Store Call Log
   * POST /api/v1/mobile/chat/calls/log
   *
   * Simple endpoint to store call log values directly.
   */
  storeCallLog = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { receiverId, conversationId, callType, status, duration, answeredAt, endedAt } =
        req.body;

      // Validation
      if (!receiverId) {
        res.status(400).json(ApiResponse.error('receiverId is required', 400));
        return;
      }

      // Validate callType
      const parsedCallType = callType ? parseInt(callType) : CALL_TYPE.AUDIO;
      if (!isValidCallType(parsedCallType)) {
        res.status(400).json(ApiResponse.error('callType must be 1 (AUDIO) or 2 (VIDEO)', 400));
        return;
      }

      // Validate status
      const parsedStatus = status ? parseInt(status) : CALL_STATUS.INITIATED;
      if (!isValidCallStatus(parsedStatus)) {
        res.status(400).json(ApiResponse.error('Invalid status', 400));
        return;
      }

      if (receiverId === userId) {
        res.status(400).json(ApiResponse.error('Cannot call yourself', 400));
        return;
      }

      // Check if receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true },
      });

      if (!receiver) {
        res.status(404).json(ApiResponse.error('Receiver not found', 404));
        return;
      }

      // Store call log
      const callLog = await prisma.callLog.create({
        data: {
          callerId: userId,
          receiverId: receiverId,
          conversationId: conversationId ? parseInt(conversationId) : undefined,
          callType: parsedCallType,
          status: parsedStatus,
          answeredAt: answeredAt ? new Date(answeredAt) : undefined,
          endedAt: endedAt ? new Date(endedAt) : undefined,
          duration: duration ? parseInt(duration) : undefined,
        },
        include: {
          caller: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          conversation: {
            select: {
              id: true,
              uuid: true,
              type: true,
              name: true,
            },
          },
        },
      });

      res.status(201).json(ApiResponse.success(callLog, 'Call log stored successfully'));
    } catch (error: any) {
      console.error('[CallController] Error storing call log:', error);
      res.status(500).json(ApiResponse.serverError('Failed to store call log'));
    }
  };

  /**
   * Generate Agora Token
   * POST /api/agora/token
   *
   * Generates an Agora RTC token for audio/video calling.
   * Only generates token, does NOT send notification or create call log.
   *
   * NOTE: Commented out - Agora dependency not installed yet
   */
  // generateAgoraToken = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const userId = (req as any).user?.id;
  //     if (!userId) {
  //       res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
  //       return;
  //     }

  //     const { channelName, uid } = req.body;

  //     // Validation
  //     if (!channelName || typeof channelName !== 'string') {
  //       res.status(400).json(ApiResponse.error('channelName is required and must be a string', 400));
  //       return;
  //     }

  //     if (!uid || typeof uid !== 'number') {
  //       res.status(400).json(ApiResponse.error('uid is required and must be a number', 400));
  //       return;
  //     }

  //     // Validate channel name format and ensure user is authorized
  //     const parsedChannel = AgoraService.parseChannelName(channelName);
  //     if (!parsedChannel) {
  //       res.status(400).json(
  //         ApiResponse.error(
  //           'Invalid channel name format. Expected format: call_{smaller_user_id}_{larger_user_id}',
  //           400
  //         )
  //       );
  //       return;
  //     }

  //     const [smallerId, largerId] = parsedChannel;
  //     // Ensure the authenticated user is one of the users in the channel
  //     if (userId !== smallerId && userId !== largerId) {
  //       res.status(403).json(
  //         ApiResponse.error('You are not authorized to generate a token for this channel', 403)
  //       );
  //       return;
  //     }

  //     // Generate token
  //     const { token, expiresIn } = agoraService.generateToken({
  //       channelName,
  //       uid,
  //     });

  //     res.status(200).json(
  //       ApiResponse.success(
  //         {
  //           token,
  //           expiresIn,
  //         },
  //         'Token generated successfully'
  //       )
  //     );
  //   } catch (error: any) {
  //     console.error('[CallController] Error generating Agora token:', error);
  //     res.status(500).json(
  //       ApiResponse.serverError(error.message || 'Failed to generate Agora token')
  //     );
  //   }
  // };

  /**
   * Start Call
   * POST /api/call/start
   *
   * Starts a call by sending notification to receiver and creating call log.
   * Accepts channelName from frontend (no validation).
   * Does NOT perform any Agora operations - just notification and call log.
   */
  startCall = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const { channelName, receiverId, callType, conversationId } = req.body;

      // Validation
      if (!channelName || typeof channelName !== 'string') {
        res
          .status(400)
          .json(ApiResponse.error('channelName is required and must be a string', 400));
        return;
      }

      if (!receiverId) {
        res.status(400).json(ApiResponse.error('receiverId is required', 400));
        return;
      }

      const parsedReceiverId = parseInt(receiverId);
      if (isNaN(parsedReceiverId)) {
        res.status(400).json(ApiResponse.error('receiverId must be a valid number', 400));
        return;
      }

      // Validate callType (optional, defaults to AUDIO if not provided)
      const parsedCallType = callType ? parseInt(callType) : CALL_TYPE.AUDIO;
      if (!isValidCallType(parsedCallType)) {
        res.status(400).json(ApiResponse.error('callType must be 1 (AUDIO) or 2 (VIDEO)', 400));
        return;
      }

      // Prevent calling yourself
      if (parsedReceiverId === userId) {
        res.status(400).json(ApiResponse.error('Cannot call yourself', 400));
        return;
      }

      // Validate receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: parsedReceiverId },
        select: { id: true },
      });

      if (!receiver) {
        res.status(404).json(ApiResponse.error('Receiver not found', 404));
        return;
      }

      // Check if receiver is busy (in an active call)
      const busyCheck = await this.callService.isUserBusy(parsedReceiverId);
      if (busyCheck.isBusy && busyCheck.activeCall) {
        res.status(409).json(
          ApiResponse.error('User is currently on another call', 409, {
            isBusy: true,
            receiverId: parsedReceiverId,
            activeCall: {
              callId: busyCheck.activeCall.callId,
              callType: busyCheck.activeCall.callType,
              withUserId: busyCheck.activeCall.withUserId,
              status: busyCheck.activeCall.status,
              startedAt: busyCheck.activeCall.startedAt,
            },
          })
        );
        return;
      }

      // Get caller info for notification
      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          userName: true,
          profileFile: true,
          profileFileStorage: true,
        },
      });

      if (!caller) {
        res.status(404).json(ApiResponse.error('Caller not found', 404));
        return;
      }

      // Store call status in memory (for real-time status checks)
      // const isVideoCall = parsedCallType === CALL_TYPE.VIDEO;
      // callStatusService.setUserInCall(userId, channelName, isVideoCall, parsedReceiverId);

      // Create call log in database
      const callLog = await prisma.callLog.create({
        data: {
          callerId: userId,
          receiverId: parsedReceiverId,
          channelName: channelName,
          callType: parsedCallType,
          conversationId: conversationId ? parseInt(conversationId) : undefined,
          status: CALL_STATUS.INITIATED,
        },
      });

      // Send FCM notification to receiver
      console.log(
        `[CallController] 📞 Sending incoming call notification - callerId: ${userId}, receiverId: ${parsedReceiverId}, callId: ${callLog.id}`
      );
      this.notificationService
        .sendCallNotification(
          parsedReceiverId,
          userId,
          {
            callType: parsedCallType,
            conversationId: conversationId ? parseInt(conversationId) : undefined,
            callId: callLog.id,
            channelName: channelName, // Agora channel name
          } as {
            callType: number;
            conversationId?: number;
            callId?: number;
            channelName?: string;
          },
          caller
        )
        .then(() => {
          console.log(
            `[CallController] ✅ Incoming call notification sent successfully to receiver ${parsedReceiverId}`
          );
        })
        .catch(error => {
          console.error(
            `[CallController] ❌ Error sending incoming call notification to receiver ${parsedReceiverId}:`,
            error
          );
          // Don't fail call start if notification fails
        });

      res.status(200).json(
        ApiResponse.success(
          {
            callId: callLog.id,
            channelName: channelName,
            notificationSent: true,
          },
          'Call started successfully'
        )
      );
    } catch (error: any) {
      console.error('[CallController] Error starting call:', error);
      res.status(500).json(ApiResponse.serverError('Failed to start call'));
    }
  };

  /**
   * Store Call Log (Updated for new requirements)
   * POST /api/call/log
   *
   * Stores call log with all required fields including channel name.
   */
  storeCallLogV2 = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const {
        callerId,
        receiverId,
        channelName,
        callType,
        status,
        duration,
        startTime,
        endTime,
        isIncoming,
      } = req.body;

      // Validation
      if (!callerId || !receiverId) {
        res.status(400).json(ApiResponse.error('callerId and receiverId are required', 400));
        return;
      }

      if (!channelName || typeof channelName !== 'string') {
        res
          .status(400)
          .json(ApiResponse.error('channelName is required and must be a string', 400));
        return;
      }

      if (!callType || !['audio', 'video'].includes(callType)) {
        res.status(400).json(ApiResponse.error('callType must be "audio" or "video"', 400));
        return;
      }

      if (!status || !['completed', 'missed', 'rejected', 'failed', 'cancelled'].includes(status)) {
        res
          .status(400)
          .json(
            ApiResponse.error(
              'status must be one of: completed, missed, rejected, failed, cancelled',
              400
            )
          );
        return;
      }

      if (typeof duration !== 'number' || duration < 0) {
        res.status(400).json(ApiResponse.error('duration must be a non-negative number', 400));
        return;
      }

      if (!startTime || !endTime) {
        res.status(400).json(ApiResponse.error('startTime and endTime are required', 400));
        return;
      }

      if (typeof isIncoming !== 'boolean') {
        res.status(400).json(ApiResponse.error('isIncoming must be a boolean', 400));
        return;
      }

      // Validate that the authenticated user is either caller or receiver
      if (userId !== parseInt(callerId) && userId !== parseInt(receiverId)) {
        res
          .status(403)
          .json(ApiResponse.error('You are not authorized to create this call log', 403));
        return;
      }

      // Validate channel name format
      // NOTE: Agora validation commented out - Agora dependency not installed
      // const parsedChannel = AgoraService.parseChannelName(channelName);
      // if (!parsedChannel) {
      //   res.status(400).json(
      //     ApiResponse.error(
      //       'Invalid channel name format. Expected format: call_{smaller_user_id}_{larger_user_id}',
      //       400
      //     )
      //   );
      //   return;
      // }

      // Validate dates
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res
          .status(400)
          .json(ApiResponse.error('Invalid date format for startTime or endTime', 400));
        return;
      }

      if (endDate <= startDate) {
        res.status(400).json(ApiResponse.error('endTime must be after startTime', 400));
        return;
      }

      // Convert call type to internal format
      const internalCallType = callType === 'video' ? CALL_TYPE.VIDEO : CALL_TYPE.AUDIO;

      // Convert status to internal format
      let internalStatus: number;
      switch (status) {
        case 'completed':
          internalStatus = CALL_STATUS.ENDED;
          break;
        case 'missed':
          internalStatus = CALL_STATUS.MISSED;
          break;
        case 'rejected':
          internalStatus = CALL_STATUS.REJECTED;
          break;
        case 'failed':
        case 'cancelled':
          internalStatus = CALL_STATUS.INITIATED; // Use INITIATED as fallback
          break;
        default:
          internalStatus = CALL_STATUS.INITIATED;
      }

      // Store call log
      const callLog = await prisma.callLog.create({
        data: {
          callerId: parseInt(callerId),
          receiverId: parseInt(receiverId),
          channelName: channelName,
          callType: internalCallType,
          status: internalStatus,
          duration: duration,
          initiatedAt: startDate,
          answeredAt: status === 'completed' ? startDate : null,
          endedAt: endDate,
        },
        include: {
          caller: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
        },
      });

      res.status(201).json(
        ApiResponse.success(
          {
            callLogId: callLog.id,
            message: 'Call log saved successfully',
          },
          'Call log saved successfully'
        )
      );
    } catch (error: any) {
      console.error('[CallController] Error storing call log:', error);
      res.status(500).json(ApiResponse.serverError('Failed to store call log'));
    }
  };

  /**
   * Get Call Log by ID
   * GET /api/v1/mobile/chat/calls/:callId
   *
   * Retrieves a specific call log by ID.
   */
  getCallLogById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.unauthorized('User not authenticated'));
        return;
      }

      const callIdParam = Array.isArray(req.params.callId)
        ? req.params.callId[0]
        : req.params.callId;
      const callId = parseInt(callIdParam, 10);

      if (!callId || isNaN(callId)) {
        res.status(400).json(ApiResponse.error('Invalid callId', 400));
        return;
      }

      const callLog = await prisma.callLog.findUnique({
        where: { id: callId },
        include: {
          caller: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              userName: true,
              profileFile: true,
              profileFileStorage: true,
            },
          },
          conversation: {
            select: {
              id: true,
              uuid: true,
              type: true,
              name: true,
            },
          },
        },
      });

      if (!callLog) {
        res.status(404).json(ApiResponse.error('Call log not found', 404));
        return;
      }

      // Verify user is either caller or receiver
      if (callLog.callerId !== userId && callLog.receiverId !== userId) {
        res.status(403).json(ApiResponse.error('You are not authorized to view this call', 403));
        return;
      }

      res.status(200).json(ApiResponse.success(callLog, 'Call log retrieved successfully'));
    } catch (error: any) {
      console.error('[CallController] Error getting call log:', error);
      res.status(500).json(ApiResponse.serverError('Failed to get call log'));
    }
  };
}
