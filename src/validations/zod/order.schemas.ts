import { z } from 'zod';
import { PAYMENT_METHOD } from '../../constants/order.constants';

// Create order validation schema
export const createOrderSchema = z.object({
  postId: z.number().int().positive('Post ID must be a positive integer'),
  addressId: z.number().int().positive('Address ID must be a positive integer'),
  paymentMethod: z.enum(
    [PAYMENT_METHOD.WALLET, PAYMENT_METHOD.CARD, PAYMENT_METHOD.UPI] as [string, ...string[]],
    {
      message: `Payment method must be one of: ${PAYMENT_METHOD.WALLET}, ${PAYMENT_METHOD.CARD}, ${PAYMENT_METHOD.UPI}`,
    }
  ),
  notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
});

// Reject order schema
export const rejectOrderSchema = z.object({
  reason: z
    .string()
    .min(10, 'Rejection reason must be at least 10 characters')
    .max(500, 'Rejection reason must be at most 500 characters'),
});

// Ship order schema (optional fields)
export const shipOrderSchema = z.object({
  trackingNumber: z.string().max(100, 'Tracking number must be at most 100 characters').optional(),
  carrier: z.string().max(50, 'Carrier name must be at most 50 characters').optional(),
});

// Type exports
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
