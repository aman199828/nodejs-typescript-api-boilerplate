import { body, param } from 'express-validator';

// User State constants matching the Laravel model
const USER_STATE = {
  INACTIVE: 0,
  ACTIVE: 1,
  PENDING: 3,
  DELETED: 4,
  REJECTED: 5,
  BLOCKED: 6,
} as const;

/**
 * Validation for updating user status
 */
export const validateUserStatusUpdate = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),

  body('stateId')
    .optional()
    .isInt()
    .isIn(Object.values(USER_STATE))
    .withMessage(`stateId must be one of: ${Object.values(USER_STATE).join(', ')}`),

  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters'),
];

/**
 * Validation for setting user inactive
 */
export const validateSetUserInactive = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
];

/**
 * Validation for setting user active
 */
export const validateSetUserActive = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
];

/**
 * Validation for setting user deleted
 */
export const validateSetUserDeleted = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),

  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters'),
];

/**
 * Validation for updating user profile
 */
export const validateUpdateUser = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),

  body('firstName')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),

  body('lastName')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters'),

  body('email').optional().isEmail().withMessage('Must be a valid email address'),

  body('phone')
    .optional()
    .isString()
    .isLength({ min: 10, max: 20 })
    .withMessage('Phone number must be between 10 and 20 characters'),

  body('countryCode')
    .optional()
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('Country code must be between 1 and 10 characters'),

  body('userName')
    .optional()
    .isString()
    .isLength({ min: 3, max: 150 })
    .withMessage('Username must be between 3 and 150 characters'),

  body('profileFile')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Profile file path must be less than 255 characters'),

  body('coverImage')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Cover image path must be less than 255 characters'),

  body('profession')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Profession must be less than 255 characters'),

  body('bio')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Bio must be less than 1000 characters'),

  body('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),

  body('instagram')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Instagram link must be less than 255 characters'),

  body('facebook')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Facebook link must be less than 255 characters'),

  body('twitter')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('Twitter link must be less than 255 characters'),

  body('password')
    .optional()
    .isString()
    .isLength({ min: 6, max: 255 })
    .withMessage('Password must be between 6 and 255 characters'),

  body('roleId')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Role ID must be between 1 and 3'),

  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean value'),

  body('isVerified').optional().isBoolean().withMessage('isVerified must be a boolean value'),

  body('stateId')
    .optional()
    .isInt()
    .isIn([0, 1, 3, 4, 5, 6])
    .withMessage(
      'stateId must be one of: 0 (Inactive), 1 (Active), 3 (Pending), 4 (Deleted), 5 (Rejected), 6 (Blocked)'
    ),

  body('typeId')
    .optional()
    .isInt({ min: 0, max: 3 })
    .withMessage('Type ID must be between 0 and 3'),
];

/**
 * Validation for toggle user state
 */
export const validateToggleUserState = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),

  body('stateId')
    .isInt()
    .isIn([0, 1, 3, 4, 5, 6])
    .withMessage(
      'stateId must be one of: 0 (Inactive), 1 (Active), 3 (Pending), 4 (Deleted), 5 (Rejected), 6 (Blocked)'
    ),
];

/**
 * Get available user states for validation
 */
export const getUserStates = () => USER_STATE;

/**
 * Get user state name by ID
 */
export const getUserStateName = (stateId: number): string => {
  const stateNames = {
    [USER_STATE.INACTIVE]: 'Inactive',
    [USER_STATE.ACTIVE]: 'Active',
    [USER_STATE.PENDING]: 'Pending',
    [USER_STATE.DELETED]: 'Deleted',
    [USER_STATE.REJECTED]: 'Rejected',
    [USER_STATE.BLOCKED]: 'Blocked',
  };

  return stateNames[stateId as keyof typeof stateNames] || 'Unknown';
};
