import { body } from 'express-validator';

export const adminLoginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 1 })
    .withMessage('Password cannot be empty'),
];

export const adminUpdateProfileValidation = [
  body('firstName')
    .optional()
    .isString()
    .withMessage('First name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),
  body('lastName')
    .optional()
    .isString()
    .withMessage('Last name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters'),
  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 1, max: 201 })
    .withMessage('Name must be between 1 and 201 characters'),
];

export const adminUpdatePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'New password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match new password');
    }
    return true;
  }),
];
