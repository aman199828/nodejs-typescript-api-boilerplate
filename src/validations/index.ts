// Export all Zod schemas
export * from './zod/auth.schemas';

// Export validation middleware
export {
  validateZod,
  validateZodQuery,
  validateZodParams,
  validateZodAll,
} from '../middleware/zod-validation';

// Re-export legacy validations for backward compatibility
export * from './auth.validations';
export * from './admin.validations';

// Export story validation schemas
export * from './story.schemas';

// Export address validation schemas
export * from './zod/address.schemas';

// Export order validation schemas
export * from './zod/order.schemas';
