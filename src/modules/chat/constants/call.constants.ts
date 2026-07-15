/**
 * Call Type Constants
 * Used to identify the type of call
 */
export const CALL_TYPE = {
  AUDIO: 1, // Audio-only call
  VIDEO: 2, // Video call (with audio)
} as const;

export const CALL_TYPE_LABELS = {
  [CALL_TYPE.AUDIO]: 'AUDIO',
  [CALL_TYPE.VIDEO]: 'VIDEO',
} as const;

export type CallTypeId = (typeof CALL_TYPE)[keyof typeof CALL_TYPE];

/**
 * Call Status Constants
 * Used to track the status of a call
 */
export const CALL_STATUS = {
  INITIATED: 1, // Call was started, waiting for answer
  ANSWERED: 2, // Receiver answered the call
  REJECTED: 3, // Receiver rejected the call
  ENDED: 4, // Call ended (after being answered)
  MISSED: 5, // Call was not answered (timeout or user offline)
} as const;

export const CALL_STATUS_LABELS = {
  [CALL_STATUS.INITIATED]: 'INITIATED',
  [CALL_STATUS.ANSWERED]: 'ANSWERED',
  [CALL_STATUS.REJECTED]: 'REJECTED',
  [CALL_STATUS.ENDED]: 'ENDED',
  [CALL_STATUS.MISSED]: 'MISSED',
} as const;

/**
 * Call Status String Constants (for API requests)
 * Used in POST /api/call/status endpoint
 */
export const CALL_STATUS_STRING = {
  REJECT: 'reject',
  END: 'end',
  NOT_ANSWERED: 'not_answered',
} as const;

export type CallStatusString = (typeof CALL_STATUS_STRING)[keyof typeof CALL_STATUS_STRING];

export type CallStatusId = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

/**
 * Helper functions
 */
export function getCallTypeLabel(callType: CallTypeId): string {
  return CALL_TYPE_LABELS[callType] || 'UNKNOWN';
}

export function isValidCallType(callType: number): callType is CallTypeId {
  return Object.values(CALL_TYPE).includes(callType as CallTypeId);
}

export function getCallStatusLabel(status: CallStatusId): string {
  return CALL_STATUS_LABELS[status] || 'UNKNOWN';
}

export function isValidCallStatus(status: number): status is CallStatusId {
  return Object.values(CALL_STATUS).includes(status as CallStatusId);
}
