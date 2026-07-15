import { z } from 'zod';
import { UserState } from '../../constants/userStates';

// Schema for updating user state
export const updateUserStateSchema = z.object({
  state: z
    .number()
    .int()
    .refine(state => [UserState.ACTIVE, UserState.BLOCKED].includes(state), {
      message: 'State must be 1 (Active) or 6 (Blocked)',
    }),
});

// Schema for rejecting user
export const rejectUserSchema = z.object({
  reason: z
    .string()
    .min(1, 'Rejection reason is required')
    .max(500, 'Rejection reason must be less than 500 characters')
    .optional(),
});

// Schema for user ID parameter
export const userIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'User ID must be a valid number')
    .transform(val => parseInt(val, 10)),
});

// Schema for toggle user state (no body required)
export const toggleUserStateSchema = z.object({});

// Schema for verify user (no body required)
export const verifyUserSchema = z.object({});
