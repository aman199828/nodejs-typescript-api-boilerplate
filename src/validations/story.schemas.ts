import { z } from 'zod';

// Story creation validation
export const createStorySchema = z.object({
  caption: z.string().max(500).optional(),
  visibility: z.enum(['public', 'subscribers']).default('public'),
  songId: z.coerce.number().int().positive().optional().nullable(),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>;
