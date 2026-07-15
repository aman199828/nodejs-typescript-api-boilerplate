import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 1))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'Page must be a positive integer',
    }),
  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 10))
    .refine(val => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    }),
  search: z
    .string()
    .optional()
    .refine(val => !val || val.trim().length > 0, {
      message: 'Search term cannot be empty',
    }),
  sortBy: z
    .string()
    .optional()
    .refine(val => !val || val.trim().length > 0, {
      message: 'SortBy field cannot be empty',
    }),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const userFiltersSchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform(val => (val === undefined ? undefined : val === 'true')),
  isVerified: z
    .string()
    .optional()
    .transform(val => (val === undefined ? undefined : val === 'true')),
  roleId: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : undefined))
    .refine(val => !val || (!isNaN(val) && val > 0), {
      message: 'Role ID must be a positive integer',
    }),
  createdAtFrom: z
    .string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format for createdAtFrom',
    }),
  createdAtTo: z
    .string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format for createdAtTo',
    }),
});

export const userPaginationSchema = paginationQuerySchema.merge(userFiltersSchema);

// Type exports
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type UserFiltersInput = z.infer<typeof userFiltersSchema>;
export type UserPaginationInput = z.infer<typeof userPaginationSchema>;
