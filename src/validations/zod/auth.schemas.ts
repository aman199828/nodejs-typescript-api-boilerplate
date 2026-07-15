import { z } from 'zod';

// Common validation patterns
const emailSchema = z.string().email('Please provide a valid email').toLowerCase();
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number');

const phoneSchema = z
  .string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(15, 'Phone number must be at most 15 digits')
  .regex(/^\d+$/, 'Phone number must contain only digits');

const countryCodeSchema = z
  .string()
  .min(1, 'Country code is required')
  .max(5, 'Country code must be at most 5 characters')
  .transform(val => {
    const trimmed = (val || '').trim();
    // Remove the + symbol if present
    const normalized = trimmed.replace(/^\+/, '');
    return normalized;
  })
  .refine(val => /^\d{1,4}$/.test(val), {
    message: 'Country code must contain only digits (1-4 digits)',
  });

const countrySchema = z
  .string()
  .min(2, 'Country code must be at least 2 characters')
  .max(2, 'Country code must be exactly 2 characters')
  .regex(/^[A-Z]{2}$/, 'Country code must be exactly 2 uppercase letters (e.g., US, CA, GB)')
  .transform(val => val.toUpperCase());

const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be at most 100 characters')
  .trim();

const otpSchema = z
  .union([
    z
      .string()
      .length(6, 'OTP must be exactly 6 digits')
      .regex(/^\d{6}$/, 'OTP must contain only digits'),
    z
      .number()
      .int()
      .min(100000, 'OTP must be at least 6 digits')
      .max(999999, 'OTP must be at most 6 digits'),
  ])
  .transform(val => (typeof val === 'string' ? parseInt(val) : val));

// Auth schemas
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// Mobile auth schemas
export const mobileSignupSchema = z.object({
  phone: phoneSchema,
  countryCode: countryCodeSchema,
  country: countrySchema,
  email: emailSchema,
  name: nameSchema,
  // Optional device details for push notifications
  fcmToken: z.string().optional(),
  deviceType: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), // 1 = ios, 2 = android, 3 = web
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

export const verifyPhoneOTPSchema = z
  .object({
    otp: otpSchema,
  })
  .and(
    z.union([
      // Option 1: userId only
      z.object({
        userId: z.number().int().positive('User ID must be a positive integer'),
      }),
      // Option 2: phone + countryCode
      z.object({
        phone: phoneSchema,
        countryCode: countryCodeSchema,
      }),
      // Option 3: email only
      z.object({
        email: emailSchema,
      }),
    ])
  );

export const verifyEmailOTPSchema = z
  .object({
    otp: otpSchema,
  })
  .and(
    z.union([
      // Option 1: userId only
      z.object({
        userId: z.number().int().positive('User ID must be a positive integer'),
      }),
      // Option 2: phone + countryCode
      z.object({
        phone: phoneSchema,
        countryCode: countryCodeSchema,
      }),
      // Option 3: email only
      z.object({
        email: emailSchema,
      }),
    ])
  );

// Update profile schema - all fields are optional for individual updates
const optionalString = z.preprocess(v => (v === '' ? undefined : v), z.string().optional());
const optionalPhone = z.preprocess(v => (v === '' ? undefined : v), phoneSchema.optional());
const optionalCountry = z.preprocess(v => (v === '' ? undefined : v), countryCodeSchema.optional());
const optionalPassword = z.preprocess(v => (v === '' ? undefined : v), passwordSchema.optional());
const optionalDob = z.preprocess(
  v => (v === '' ? undefined : v),
  z.union([z.string(), z.date()]).optional()
);
const optionalSubscriptionFee = z.preprocess(v => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const num = parseFloat(v);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}, z.number().nonnegative('Subscription fee must be a non-negative number').optional());

export const updateProfileSchema = z
  .object({
    name: optionalString,
    firstName: optionalString,
    lastName: optionalString,
    phone: optionalPhone,
    countryCode: optionalCountry,
    // email removed from update profile per requirement
    profileFile: optionalString,
    password: optionalPassword,
    dob: optionalDob,
    coverImage: optionalString,
    userName: optionalString,
    profession: optionalString,
    bio: z.preprocess(v => (v === '' ? undefined : v), z.string().max(2000).optional()),
    instagram: optionalString,
    facebook: optionalString,
    twitter: optionalString,
    subscriptionFee: optionalSubscriptionFee,
  })
  .refine(
    data => {
      // At least one field must be provided and not empty
      const nonEmptyFields = Object.entries(data).filter(
        ([key, value]) => value !== undefined && value !== null && value !== ''
      );
      return nonEmptyFields.length > 0;
    },
    {
      message: 'At least one field must be provided for update',
    }
  );

// Setup password schema (token-based, no userId needed)
export const setupPasswordSchema = z.object({
  password: passwordSchema,
});

// Unified login schema - supports email+password or phone+countryCode+password
// Device details are optional (for push notifications)
export const loginSchema = z
  .object({
    password: z.string().min(1, 'Password is required'),
    // Optional device details for push notifications
    fcmToken: z.string().optional(),
    deviceType: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), // 1 = ios, 2 = android, 3 = web
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
  })
  .and(
    z.union([
      // Option 1: Email + password
      z.object({
        email: emailSchema,
      }),
      // Option 2: Phone + countryCode + password
      z.object({
        phone: phoneSchema,
        countryCode: countryCodeSchema,
      }),
    ])
  );

export const loginWithEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  // Optional device details for push notifications
  fcmToken: z.string().optional(),
  deviceType: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), // 1 = ios, 2 = android, 3 = web
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

export const loginWithPhoneSchema = z.object({
  phone: phoneSchema,
  countryCode: countryCodeSchema,
  // Optional device details for push notifications
  fcmToken: z.string().optional(),
  deviceType: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), // 1 = ios, 2 = android, 3 = web
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

export const verifyPhoneLoginSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer'),
  otp: otpSchema,
});

export const resendOTPSchema = z.union([
  z.object({
    phone: phoneSchema,
    countryCode: countryCodeSchema,
  }),
  z.object({
    email: emailSchema,
  }),
]);

// OTP verification with data update schema (JWT authenticated)
export const updateContactSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    country: countrySchema.optional(),
  })
  .refine(
    data => {
      // At least one of email or phone must be provided
      return data.email !== undefined || data.phone !== undefined;
    },
    {
      message: 'Either email or phone must be provided for update',
      path: ['email'],
    }
  )
  .refine(
    data => {
      // If phone is provided, countryCode must also be provided
      if (data.phone && !data.countryCode) {
        return false;
      }
      return true;
    },
    {
      message: 'Country code is required when phone is provided',
      path: ['countryCode'],
    }
  );

export const verifyOTPUpdateSchema = z
  .object({
    otp: otpSchema,
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    country: countrySchema.optional(),
  })
  .refine(
    data => {
      // At least one of email or phone+countryCode must be provided
      return (
        data.email !== undefined || (data.phone !== undefined && data.countryCode !== undefined)
      );
    },
    {
      message: 'Either email or phone+countryCode must be provided for update',
      path: ['email'],
    }
  );

// Admin schemas
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const adminUpdateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name must be at least 1 character')
    .max(100, 'First name must be at most 100 characters')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name must be at least 1 character')
    .max(100, 'Last name must be at most 100 characters')
    .optional(),
  name: z
    .string()
    .min(1, 'Name must be at least 1 character')
    .max(201, 'Name must be at most 201 characters')
    .optional(),
});

export const adminUpdatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Password confirmation does not match',
    path: ['confirmPassword'],
  });

// Type exports for TypeScript
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type MobileSignupInput = z.infer<typeof mobileSignupSchema>;
export type VerifyPhoneOTPInput = z.infer<typeof verifyPhoneOTPSchema>;
export type VerifyEmailOTPInput = z.infer<typeof verifyEmailOTPSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginWithEmailInput = z.infer<typeof loginWithEmailSchema>;
export type LoginWithPhoneInput = z.infer<typeof loginWithPhoneSchema>;
export type VerifyPhoneLoginInput = z.infer<typeof verifyPhoneLoginSchema>;
export type ResendOTPInput = z.infer<typeof resendOTPSchema>;
export type VerifyOTPUpdateInput = z.infer<typeof verifyOTPUpdateSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminUpdateProfileInput = z.infer<typeof adminUpdateProfileSchema>;
export type AdminUpdatePasswordInput = z.infer<typeof adminUpdatePasswordSchema>;
