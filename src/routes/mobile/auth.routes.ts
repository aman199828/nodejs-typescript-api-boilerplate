import { Request, Response, Router } from 'express';
import { validateZod } from '../../middleware/zod-validation';
import { auth } from '../../middleware/auth.middleware';
import multer from 'multer';
import path from 'path';
import {
  mobileSignupSchema,
  verifyPhoneOTPSchema,
  verifyEmailOTPSchema,
  updateProfileSchema,
  setupPasswordSchema,
  loginSchema,
  loginWithEmailSchema,
  loginWithPhoneSchema,
  verifyPhoneLoginSchema,
  resendOTPSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  updateContactSchema,
  verifyOTPUpdateSchema,
} from '../../validations';
import {
  signup,
  verifyPhoneOTP,
  verifyEmailOTP,
  updateProfile,
  setupPassword,
  login,
  loginWithEmail,
  loginWithPhone,
  verifyPhoneLogin,
  resendOTP,
  userCheck,
  forgotPassword,
  logout,
  createPage,
  listPages,
  getPageById,
  getPageByTypeId,
  updatePage,
  deletePage,
  deleteAccount,
  deleteAccountPermanent,
  changePasswordMobile,
  isTokenBlacklisted,
  verifyOTPAndUpdateProfile,
  updateContact,
} from '../../controllers/mobile/auth.controller';
import { mobileAuthStrict } from '../../middleware/mobile-auth.middleware';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure temp directory exists
    const tempDir = 'public/uploads/temp';
    if (!require('fs').existsSync(tempDir)) {
      require('fs').mkdirSync(tempDir, { recursive: true });
    }
    // Temporary storage, will be moved to correct folder
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Custom file filter to set permissions after file creation
const fileFilter = (req: any, file: any, cb: any) => {
  cb(null, true);
};

// Custom storage that sets permissions after file creation
const customStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = 'public/uploads/temp';
    if (!require('fs').existsSync(tempDir)) {
      require('fs').mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage to avoid permission issues
  limits: {
    fileSize: 80 * 1024 * 1024, // 80MB limit
    files: 1, // Only allow 1 file
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow image files only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Mobile Auth
 *   description: Mobile authentication endpoints
 */

/**
 * @swagger
 * /mobile/auth/signup:
 *   post:
 *     summary: Register new user with phone and email
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - countryCode
 *               - country
 *               - email
 *               - name
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number without country code
 *               countryCode:
 *                 type: string
 *                 description: Country code without + symbol (e.g., 1, 91)
 *               country:
 *                 type: string
 *                 description: ISO 2-letter country code (e.g., US, CA, GB)
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully, OTPs sent
 *       422:
 *         description: Validation error or user already exists
 */
router.post('/signup', validateZod(mobileSignupSchema), signup);

/**
 * @swagger
 * /mobile/auth/verify-phone-otp:
 *   post:
 *     summary: Verify phone number OTP
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: User ID (optional if phone or email provided)
 *               phone:
 *                 type: string
 *                 description: Phone number (optional if userId or email provided)
 *               countryCode:
 *                 type: string
 *                 description: Country code (required if phone provided)
 *               email:
 *                 type: string
 *                 description: Email address (optional if userId or phone provided)
 *               otp:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Phone OTP verified successfully
 *       422:
 *         description: Invalid OTP or user not found
 */
router.post('/verify-phone-otp', validateZod(verifyPhoneOTPSchema), verifyPhoneOTP);

/**
 * @swagger
 * /mobile/auth/verify-email-otp:
 *   post:
 *     summary: Verify email OTP
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: User ID (optional if phone or email provided)
 *               phone:
 *                 type: string
 *                 description: Phone number (optional if userId or email provided)
 *               countryCode:
 *                 type: string
 *                 description: Country code (required if phone provided)
 *               email:
 *                 type: string
 *                 description: Email address (optional if userId or phone provided)
 *               otp:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Email OTP verified successfully
 *       422:
 *         description: Invalid OTP or user not found
 */
router.post('/verify-email-otp', validateZod(verifyEmailOTPSchema), verifyEmailOTP);

/**
 * @swagger
 * /mobile/auth/resend-otp:
 *   post:
 *     summary: Resend OTP for phone or email
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number without country code
 *               countryCode:
 *                 type: string
 *                 description: Country code without + symbol (e.g., 1, 91)
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP generated successfully
 *       404:
 *         description: User not found
 *       422:
 *         description: Invalid request
 */
router.post('/resend-otp', validateZod(resendOTPSchema), resendOTP);

/**
 * @swagger
 * /mobile/auth/user-check:
 *   post:
 *     summary: Check user details using token
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *       401:
 *         description: Invalid or expired token
 *       404:
 *         description: User not found
 */
router.post('/user-check', userCheck);

/**
 * @swagger
 * /mobile/auth/update-profile:
 *   patch:
 *     summary: Update user profile (partial update - single or multiple fields)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               countryCode:
 *                 type: string
 *               profileFile:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file
 *               dob:
 *                 type: string
 *                 format: date
 *                 description: Date of birth (YYYY-MM-DD)
 *               coverImage:
 *                 type: string
 *                 format: binary
 *                 description: Cover image file
 *               userName:
 *                 type: string
 *               profession:
 *                 type: string
 *               bio:
 *                 type: string
 *                 maxLength: 2000
 *               instagram:
 *                 type: string
 *               facebook:
 *                 type: string
 *               twitter:
 *                 type: string
 *               subscriptionFee:
 *                 type: number
 *                 description: Subscription fee amount
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: New password
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Invalid or expired token
 *       400:
 *         description: Validation error
 */
router.patch(
  '/update-profile',
  mobileAuthStrict,
  upload.fields([
    { name: 'profileFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ]),
  validateZod(updateProfileSchema),
  updateProfile
);

/**
 * @swagger
 * /mobile/auth/setup-password:
 *   post:
 *     summary: Setup password after OTP verification
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password set up successfully
 *       401:
 *         description: Invalid or expired token
 *       400:
 *         description: Validation error or user not verified
 */
router.post('/setup-password', mobileAuthStrict, validateZod(setupPasswordSchema), setupPassword);

/**
 * @swagger
 * /mobile/auth/login:
 *   post:
 *     summary: Login with email+password or phone+countryCode+password
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - email
 *                   - password
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                   password:
 *                     type: string
 *               - type: object
 *                 required:
 *                   - phone
 *                   - countryCode
 *                   - password
 *                 properties:
 *                   phone:
 *                     type: string
 *                   countryCode:
 *                     type: string
 *                   password:
 *                     type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       422:
 *         description: Validation error
 */
router.post('/login', validateZod(loginSchema), login);

/**
 * @swagger
 * /mobile/auth/login-email:
 *   post:
 *     summary: Login with email and password
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 */
router.post('/login-email', validateZod(loginWithEmailSchema), loginWithEmail);

/**
 * @swagger
 * /mobile/auth/login-phone:
 *   post:
 *     summary: Login with phone number (sends OTP)
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - countryCode
 *             properties:
 *               phone:
 *                 type: string
 *               countryCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent to phone
 *       404:
 *         description: User not found
 */
router.post('/login-phone', validateZod(loginWithPhoneSchema), loginWithPhone);

/**
 * @swagger
 * /mobile/auth/verify-phone-login:
 *   post:
 *     summary: Verify phone OTP for login
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - otp
 *             properties:
 *               userId:
 *                 type: integer
 *               otp:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Login successful
 *       422:
 *         description: Invalid OTP
 */
router.post('/verify-phone-login', validateZod(verifyPhoneLoginSchema), verifyPhoneLogin);

/**
 * @swagger
 * /mobile/auth/forgot-password:
 *   post:
 *     summary: Send password reset OTP via email
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send password reset OTP
 *     responses:
 *       200:
 *         description: Password reset OTP sent successfully
 *       404:
 *         description: User not found with this email
 *       422:
 *         description: Invalid email format
 */
router.post('/forgot-password', validateZod(forgotPasswordSchema), forgotPassword);

/**
 * @swagger
 * /mobile/auth/logout:
 *   post:
 *     summary: Logout user and delete all tokens
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error during logout
 */
router.post('/logout', mobileAuthStrict, logout);

/**
 * @swagger
 * /mobile/auth/pages/{typeId}:
 *   post:
 *     summary: Create a new page
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: path
 *         name: typeId
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4, 5]
 *         description: 1=privacy_policy, 2=terms, 3=faq, 4=about_us, 5=contact_us
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               stateId:
 *                 type: integer
 *                 default: 1
 *               createdById:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Page created
 *       400:
 *         description: Validation error
 */
// Removing mobile page create/update/delete routes as requested
// router.post('/pages/:typeId', createPage);

/**
 * @swagger
 * /mobile/auth/pages:
 *   get:
 *     summary: List pages (optionally filtered by type)
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: query
 *         name: typeId
 *         schema: { type: integer, enum: [1, 2, 3, 4, 5, 6] }
 *         description: 1=privacy_policy, 2=terms_of_service, 3=data_processing_agreement, 4=faq, 5=about_us, 6=contact_us
 *     responses:
 *       200:
 *         description: Pages list
 */
router.get('/pages', listPages);

/**
 * @swagger
 * /mobile/auth/pages/{id}:
 *   get:
 *     summary: Get a page by id
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Page details
 *       404:
 *         description: Page not found
 */
router.get('/pages/:id', getPageById);

/**
 * @swagger
 * /mobile/auth/pages/type/{typeId}:
 *   get:
 *     summary: Get page by type ID
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: path
 *         name: typeId
 *         schema: { type: integer, enum: [1, 2, 3, 4, 5, 6] }
 *         required: true
 *         description: 1=privacy_policy, 2=terms_of_service, 3=data_processing_agreement, 4=faq, 5=about_us, 6=contact_us
 *     responses:
 *       200:
 *         description: Page details
 *       404:
 *         description: Page not found
 */
router.get('/pages/type/:typeId', getPageByTypeId);

/**
 * @swagger
 * /mobile/auth/pages/{id}:
 *   put:
 *     summary: Update a page
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               stateId:
 *                 type: integer
 *               typeId:
 *                 type: integer
 *                 enum: [1, 2, 3, 4, 5]
 *                 description: 1=privacy_policy, 2=terms, 3=faq, 4=about_us, 5=contact_us
 *     responses:
 *       200:
 *         description: Page updated
 *       404:
 *         description: Page not found
 */
// router.put('/pages/:id', updatePage);

/**
 * @swagger
 * /mobile/auth/pages/{id}:
 *   delete:
 *     summary: Delete a page
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Page deleted
 *       404:
 *         description: Page not found
 */
// router.delete('/pages/:id', deletePage);

/**
 * @swagger
 * /mobile/auth/upload/profile:
 *   post:
 *     summary: Upload profile image
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file
 *     responses:
 *       200:
 *         description: Profile image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     url:
 *                       type: string
 *       401:
 *         description: Invalid or expired token
 *       400:
 *         description: No file uploaded or invalid file type
 */
router.post('/upload/profile', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Save file to profile_file folder using memory storage
    const fs = require('fs');
    const fileName = `profile_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname)}`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'profile_file', fileName);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write buffer to file
    console.log(`Profile upload: Writing file ${fileName}, size: ${req.file.buffer.length} bytes`);
    const startWrite = Date.now();
    fs.writeFileSync(filePath, req.file.buffer);
    console.log(`Profile upload: File written in ${Date.now() - startWrite}ms`);

    // Update user's profile in database
    const { prisma } = require('../../lib/prisma');
    const fileUrl = `/uploads/profile_file/${fileName}`;

    console.log(`Profile upload: Updating database for user ${decoded.userId}`);
    const startDb = Date.now();

    try {
      await prisma.user.update({
        where: { id: decoded.userId },
        data: { profileFile: fileUrl },
      });
      console.log(`Profile upload: Database updated successfully in ${Date.now() - startDb}ms`);
    } catch (dbError) {
      console.error('Profile upload: Database update failed:', dbError);
      throw dbError;
    }

    // Generate full URL for response
    const getFileUrl = (filePath: string | null): string | null => {
      if (!filePath) return null;
      const baseUrl = process.env.BASE_URL || 'http://54.177.64.236/backend';
      const parts = filePath.split('/').filter(Boolean); // [uploads, folder, filename]
      const folder = parts[1];
      const filename = parts.slice(2).join('/');
      return `${baseUrl}/file/download/${folder}/${filename}`;
    };

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        filename: fileName,
        url: getFileUrl(fileUrl),
      },
    });
  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading profile image',
    });
  }
});

/**
 * @swagger
 * /mobile/auth/upload/cover:
 *   post:
 *     summary: Upload cover image
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Cover image file
 *     responses:
 *       200:
 *         description: Cover image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     url:
 *                       type: string
 *       401:
 *         description: Invalid or expired token
 *       400:
 *         description: No file uploaded or invalid file type
 */
router.post('/upload/cover', upload.single('file'), async (req: Request, res: Response) => {
  // Set timeout for this request
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Upload timeout - file too large or server too slow',
      });
    }
  }, 30000); // 30 second timeout

  try {
    // Verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Save file to cover_images folder using memory storage
    const fs = require('fs');
    const fileName = `cover_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname)}`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'cover_images', fileName);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write buffer to file
    console.log(`Cover upload: Writing file ${fileName}, size: ${req.file.buffer.length} bytes`);
    const startWrite = Date.now();
    fs.writeFileSync(filePath, req.file.buffer);
    console.log(`Cover upload: File written in ${Date.now() - startWrite}ms`);

    // Update user's profile in database
    const { prisma } = require('../../lib/prisma');
    const fileUrl = `/uploads/cover_images/${fileName}`;

    console.log(`Cover upload: Updating database for user ${decoded.userId}`);
    const startDb = Date.now();

    try {
      await prisma.user.update({
        where: { id: decoded.userId },
        data: { coverImage: fileUrl },
      });
      console.log(`Cover upload: Database updated successfully in ${Date.now() - startDb}ms`);
    } catch (dbError) {
      console.error('Cover upload: Database update failed:', dbError);
      throw dbError;
    }

    // Generate full URL for response
    const getFileUrl = (filePath: string | null): string | null => {
      if (!filePath) return null;
      const baseUrl = process.env.BASE_URL || 'http://54.177.64.236/backend';
      const parts = filePath.split('/').filter(Boolean);
      const folder = parts[1];
      const filename = parts.slice(2).join('/');
      return `${baseUrl}/file/download/${folder}/${filename}`;
    };

    clearTimeout(timeout); // Clear timeout on success
    res.status(200).json({
      success: true,
      message: 'Cover image uploaded successfully',
      data: {
        filename: fileName,
        url: getFileUrl(fileUrl),
      },
    });
  } catch (error) {
    clearTimeout(timeout); // Clear timeout on error
    console.error('Cover upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading cover image',
    });
  }
});

/**
 * @swagger
 * /mobile/auth/change-password:
 *   post:
 *     summary: Change password (mobile)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password or weak new password
 *       401:
 *         description: Invalid or expired token
 */
router.post(
  '/change-password',
  mobileAuthStrict,
  validateZod(changePasswordSchema),
  changePasswordMobile
);

/**
 * @swagger
 * /mobile/auth/delete-account:
 *   delete:
 *     summary: Soft delete the logged-in user's account (allows email/phone reuse)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Invalid or missing token
 *       404:
 *         description: User not found
 */
router.delete('/delete-account', mobileAuthStrict, async (req: Request, res: Response) =>
  deleteAccount(req, res)
);

/**
 * @swagger
 * /mobile/auth/delete-account/permanent:
 *   delete:
 *     summary: Permanently delete the logged-in user's account (hard delete)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account permanently deleted
 *       401:
 *         description: Invalid or missing token
 *       404:
 *         description: User not found
 */
router.delete('/delete-account/permanent', mobileAuthStrict, async (req: Request, res: Response) =>
  deleteAccountPermanent(req, res)
);

/**
 * @swagger
 * /mobile/auth/verify-otp-update:
 *   post:
 *     summary: Verify OTP and update user profile data
 *     description: |
 *       First, use the existing `/mobile/auth/resend-otp` endpoint to generate an OTP.
 *       Then use this endpoint to verify the OTP and update the user's email/phone data.
 *       OTP expires after 10 minutes. Requires JWT authentication.
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: integer
 *                 description: 6-digit OTP code (obtained from /mobile/auth/resend-otp)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address (optional)
 *               phone:
 *                 type: string
 *                 description: New phone number (optional)
 *               countryCode:
 *                 type: string
 *                 description: New country code (optional, required if phone provided)
 *               country:
 *                 type: string
 *                 description: New ISO 2-letter country code (optional, e.g., US, CA, GB)
 *     responses:
 *       200:
 *         description: OTP verified and profile updated successfully
 *       400:
 *         description: Invalid OTP, expired OTP, or validation error
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 *       404:
 *         description: User not found
 */
router.post('/update-contact', mobileAuthStrict, validateZod(updateContactSchema), updateContact);
router.post(
  '/verify-otp-update',
  mobileAuthStrict,
  validateZod(verifyOTPUpdateSchema),
  verifyOTPAndUpdateProfile
);

export default router;
