import config from '../config/config';

/**
 * Order State Constants
 * Used for order status management
 */

export const ORDER_STATE = {
  PENDING: 0, // Order created, payment done, waiting for seller acceptance
  CONFIRMED: 1, // Seller accepted the order
  PROCESSING: 2, // Order being prepared for shipping
  SHIPPED: 3, // Order has been shipped
  DELIVERED: 4, // Order has been delivered
  REJECTED: 5, // Seller rejected, refund processed
  CANCELLED: 6, // Order cancelled (future use)
} as const;

export const ORDER_STATE_LABELS = {
  [ORDER_STATE.PENDING]: 'PENDING',
  [ORDER_STATE.CONFIRMED]: 'CONFIRMED',
  [ORDER_STATE.PROCESSING]: 'PROCESSING',
  [ORDER_STATE.SHIPPED]: 'SHIPPED',
  [ORDER_STATE.DELIVERED]: 'DELIVERED',
  [ORDER_STATE.REJECTED]: 'REJECTED',
  [ORDER_STATE.CANCELLED]: 'CANCELLED',
} as const;

export type OrderStateId = (typeof ORDER_STATE)[keyof typeof ORDER_STATE];

/**
 * Payment Status Constants
 */
export const PAYMENT_STATUS = {
  PAID: 'paid',
  REFUNDED: 'refunded',
} as const;

/**
 * Payment Method Constants
 */
export const PAYMENT_METHOD = {
  WALLET: 'wallet',
  CARD: 'card',
  UPI: 'upi',
} as const;

/**
 * Platform Fee Percentage (default 10%)
 * Can be overridden via environment variable PLATFORM_FEE_PERCENTAGE
 */
export const PLATFORM_FEE_PERCENTAGE = config.ORDER?.PLATFORM_FEE_PERCENTAGE || 10;
