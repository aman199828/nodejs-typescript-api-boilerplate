import { z } from 'zod';

// Reuse common schemas from auth.schemas
const phoneSchema = z
  .string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(15, 'Phone number must be at most 15 digits')
  .regex(/^\d+$/, 'Phone number must contain only digits');

const countryCodeSchema = z
  .string()
  .min(1, 'Country code must be at least 1 character')
  .max(5, 'Country code must be at most 5 characters')
  .transform(val => {
    const trimmed = (val || '').trim();
    const normalized = trimmed.replace(/^\+/, '');
    return normalized;
  })
  .optional();

const countrySchema = z
  .string()
  .min(1, 'Country is required')
  .max(100, 'Country must be at most 100 characters')
  .transform(val => (val ? val.trim() : val));

// Address validation schemas
export const createAddressSchema = z.object({
  label: z.string().max(100, 'Label must be at most 100 characters').optional(),
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name must be at most 255 characters'),
  phone: phoneSchema,
  countryCode: countryCodeSchema,
  addressLine1: z
    .string()
    .min(1, 'Address line 1 is required')
    .max(500, 'Address line 1 must be at most 500 characters'),
  addressLine2: z.string().max(500, 'Address line 2 must be at most 500 characters').optional(),
  city: z.string().min(1, 'City is required').max(100, 'City must be at most 100 characters'),
  state: z.string().max(100, 'State must be at most 100 characters').optional(),
  postalCode: z
    .string()
    .min(1, 'Postal code is required')
    .max(20, 'Postal code must be at most 20 characters'),
  country: countrySchema,
  isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = z
  .object({
    label: z.string().max(100, 'Label must be at most 100 characters').optional(),
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .max(255, 'Full name must be at most 255 characters')
      .optional(),
    phone: phoneSchema.optional(),
    countryCode: countryCodeSchema,
    addressLine1: z
      .string()
      .min(1, 'Address line 1 is required')
      .max(500, 'Address line 1 must be at most 500 characters')
      .optional(),
    addressLine2: z.string().max(500, 'Address line 2 must be at most 500 characters').optional(),
    city: z
      .string()
      .min(1, 'City is required')
      .max(100, 'City must be at most 100 characters')
      .optional(),
    state: z.string().max(100, 'State must be at most 100 characters').optional(),
    postalCode: z
      .string()
      .min(1, 'Postal code is required')
      .max(20, 'Postal code must be at most 20 characters')
      .optional(),
    country: countrySchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    data => {
      // At least one field must be provided for update
      const hasFields = Object.keys(data).length > 0;
      return hasFields;
    },
    {
      message: 'At least one field must be provided for update',
    }
  );

// Type exports
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
