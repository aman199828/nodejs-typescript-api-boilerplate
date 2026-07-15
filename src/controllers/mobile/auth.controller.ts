import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import path from 'path';
import { OTPService } from '../../services/OTPService';
import { verifyToken } from '../../utils/jwt';
import { UserState } from '../../constants/userStates';
import { getStorageProvider } from '../../services/storage';
import { getCurrentStorageType } from '../../constants/storage.constants';
import { getFileUrlWithStorage } from '../../utils/file.utils';
import { prisma } from '../../lib/prisma';
import { AddressResource } from '../../resources/AddressResource';

import { ApiResponse } from '../../resources/ApiResponse';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to generate full URL for file paths
const getFileUrl = (filePath: string | null): string | null => {
  if (!filePath) return null;
  const baseUrl = process.env.BASE_URL || 'http://54.177.64.236/backend';
  // Normalize filePath: allow with or without '/uploads/' prefix
  const cleaned = filePath.startsWith('/uploads/')
    ? filePath.slice('/uploads/'.length)
    : filePath.replace(/^\/+/, '');
  const parts = cleaned.split('/').filter(Boolean); // [profile_file, filename]
  const folder = parts[0];
  const filename = parts.slice(1).join('/');
  if (!folder || !filename) return null;
  return `${baseUrl}/file/download/${folder}/${filename}`;
};

// Generate 6-digit OTP (static for development)
const generateOTP = (): number => {
  return 123456; // Static OTP for development
};

// Helper function to store JWT token in authToken table
const storeAuthToken = async (userId: number, token: string): Promise<void> => {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await prisma.authToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error storing auth token:', error);
    // Don't throw error here as it's not critical for the main flow
  }
};

// Helper function to check if token is blacklisted
export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  try {
    const blacklistedToken = await prisma.tokenBlacklist.findFirst({
      where: {
        token: token,
        expiresAt: { gt: new Date() }, // Only check non-expired blacklist entries
      },
    });
    return !!blacklistedToken;
  } catch (error) {
    console.error('Error checking token blacklist:', error);
    return false; // If there's an error, don't block the request
  }
};

// Send OTP via SMS (placeholder - integrate with actual SMS service)
const sendSMSOTP = async (phoneNumber: string, otp: number): Promise<boolean> => {
  // TODO: Integrate with actual SMS service like Twilio, AWS SNS, etc.
  console.log(`📱 SMS OTP for ${phoneNumber}: ${otp} (STATIC - Use this OTP for testing)`);
  return true;
};

// Send OTP via Email (placeholder - integrate with actual email service)
const sendEmailOTP = async (email: string, otp: number): Promise<boolean> => {
  // TODO: Integrate with actual email service
  console.log(`📧 Email OTP for ${email}: ${otp} (STATIC - Use this OTP for testing)`);
  return true;
};

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
 *       400:
 *         description: Validation error or user already exists
 */
export const signup = async (req: Request, res: Response) => {
  try {
    const {
      phone,
      countryCode,
      country,
      email,
      name,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    // ⚠️ SECURITY: Validate that countryCode + phone combination is unique
    // Check separately for better error messages
    const [existingUserByEmail, existingUserByPhone] = await Promise.all([
      // Check if email already exists (excluding soft-deleted users)
      prisma.user.findFirst({
        where: {
          email,
          deletedAt: null,
        },
      }),
      // Check if phone + countryCode combination already exists (excluding soft-deleted users)
      prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
          deletedAt: null,
        },
      }),
    ]);

    if (existingUserByEmail) {
      return res
        .status(400)
        .json(
          ApiResponse.error('Email already registered. Please use a different email or login.')
        );
    }

    if (existingUserByPhone) {
      return res
        .status(400)
        .json(
          ApiResponse.error(
            'Phone number with this country code is already registered. Please use a different phone number or login.'
          )
        );
    }

    // Generate OTPs
    const phoneOTP = generateOTP();
    const emailOTP = generateOTP();

    // Create user with OTPs
    const user = await prisma.user.create({
      data: {
        email,
        name,
        phone: phone,
        countryCode: countryCode,
        country: country,
        otp: phoneOTP,
        isVerified: false,
        otpVerified: false,
        isActive: true,
        stateId: UserState.PENDING, // Set to PENDING until phone verification
        roleId: 2, // Mobile user role
      },
    });

    // Register/update device details if provided
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[Signup] Device registered for user ${user.id}`);
        } else {
          console.warn(`[Signup] Invalid device type: ${deviceType}, skipping device registration`);
        }
      } catch (error) {
        // Don't fail signup if device registration fails
        console.error('[Signup] Error registering device:', error);
      }
    }

    // Send OTPs
    await sendSMSOTP(`${countryCode}${phone}`, phoneOTP);
    await sendEmailOTP(email, emailOTP);

    res.status(201).json(
      ApiResponse.success(
        {
          userId: user.id,
          message: 'Please verify your phone and email with the OTPs sent',
        },
        'User registered successfully. OTPs sent to phone and email.'
      )
    );
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

/**
 * @swagger
 * /mobile/auth/verify-phone-otp:
 *   post:
 *     summary: Verify phone number or email OTP
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
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP or user not found
 */
export const verifyPhoneOTP = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      phone,
      countryCode,
      email,
      otp,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    let user;

    // Find user by userId, phone, or email
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      });
    } else if (phone && countryCode) {
      user = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
        },
      });
    } else if (email) {
      user = await prisma.user.findUnique({
        where: { email },
      });
    } else {
      return res
        .status(400)
        .json(
          ApiResponse.validationErrorSimple(
            'identifier',
            'Please provide userId, phone with countryCode, or email'
          )
        );
    }

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (user.otp !== otp) {
      return res.status(400).json(ApiResponse.error('Invalid OTP'));
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Store token in authToken table
    await storeAuthToken(user.id, token);

    // Update user - phone verified and set stateId to ACTIVE
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        otpVerified: true,
        otpVerifiedAt: new Date(),
        stateId: UserState.ACTIVE, // Set to active state
      },
    });

    // Register/update device details if provided
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[VerifyPhoneOTP] Device registered for user ${user.id}`);
        } else {
          console.warn(
            `[VerifyPhoneOTP] Invalid device type: ${deviceType}, skipping device registration`
          );
        }
      } catch (error) {
        // Don't fail login if device registration fails
        console.error('[VerifyPhoneOTP] Error registering device:', error);
      }
    }

    // Prepare comprehensive user object for response
    const [profileFileUrl, coverImageUrl] = await Promise.all([
      getFileUrlWithStorage(
        updatedUser.profileFile,
        (updatedUser as any).profileFileStorage,
        'profile_file'
      ),
      getFileUrlWithStorage(
        (updatedUser as any).coverImage,
        (updatedUser as any).coverImageStorage,
        'cover_images'
      ),
    ]);

    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      countryCode: updatedUser.countryCode,
      country: (updatedUser as any).country ?? null,
      profileFile: profileFileUrl,
      dob: (updatedUser as any).dob ?? null,
      coverImage: coverImageUrl,
      userName: (updatedUser as any).userName ?? null,
      profession: (updatedUser as any).profession ?? null,
      bio: (updatedUser as any).bio ?? null,
      instagram: (updatedUser as any).instagram ?? null,
      facebook: (updatedUser as any).facebook ?? null,
      twitter: (updatedUser as any).twitter ?? null,
      isVerified: updatedUser.isVerified,
      otpVerified: updatedUser.otpVerified,
      stateId: updatedUser.stateId,
      isActive: updatedUser.isActive,
      roleId: updatedUser.roleId,
    };

    res.json(
      ApiResponse.success(
        {
          token,
          user: userResponse,
        },
        'Phone number verified successfully'
      )
    );
  } catch (error) {
    console.error('Phone OTP verification error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
 *       400:
 *         description: Invalid OTP or user not found
 */
export const verifyEmailOTP = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      phone,
      countryCode,
      email,
      otp,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    let user;

    // Find user by userId, phone, or email
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      });
    } else if (phone && countryCode) {
      user = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
        },
      });
    } else if (email) {
      user = await prisma.user.findUnique({
        where: { email },
      });
    } else {
      return res
        .status(400)
        .json(
          ApiResponse.validationErrorSimple(
            'identifier',
            'Please provide userId, phone with countryCode, or email'
          )
        );
    }

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (user.otp !== otp) {
      return res.status(400).json(ApiResponse.error('Invalid OTP'));
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Store token in authToken table
    await storeAuthToken(user.id, token);

    // Update user - email verified and set stateId to ACTIVE
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerifiedAt: new Date(),
        stateId: UserState.ACTIVE, // Set to active state
      },
    });

    // Register/update device details if provided
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[VerifyEmailOTP] Device registered for user ${user.id}`);
        } else {
          console.warn(
            `[VerifyEmailOTP] Invalid device type: ${deviceType}, skipping device registration`
          );
        }
      } catch (error) {
        // Don't fail login if device registration fails
        console.error('[VerifyEmailOTP] Error registering device:', error);
      }
    }

    // Prepare comprehensive user object for response
    const [profileFileUrl, coverImageUrl] = await Promise.all([
      getFileUrlWithStorage(
        updatedUser.profileFile,
        (updatedUser as any).profileFileStorage,
        'profile_file'
      ),
      getFileUrlWithStorage(
        (updatedUser as any).coverImage,
        (updatedUser as any).coverImageStorage,
        'cover_images'
      ),
    ]);

    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      countryCode: updatedUser.countryCode,
      country: (updatedUser as any).country ?? null,
      profileFile: profileFileUrl,
      dob: (updatedUser as any).dob ?? null,
      coverImage: coverImageUrl,
      userName: (updatedUser as any).userName ?? null,
      profession: (updatedUser as any).profession ?? null,
      bio: (updatedUser as any).bio ?? null,
      instagram: (updatedUser as any).instagram ?? null,
      facebook: (updatedUser as any).facebook ?? null,
      twitter: (updatedUser as any).twitter ?? null,
      isVerified: updatedUser.isVerified,
      otpVerified: updatedUser.otpVerified,
      stateId: updatedUser.stateId,
      isActive: updatedUser.isActive,
      roleId: updatedUser.roleId,
    };

    res.json(
      ApiResponse.success(
        {
          token,
          user: userResponse,
        },
        'Email verified successfully'
      )
    );
  } catch (error) {
    console.error('Email OTP verification error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
export const loginWithEmail = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return res.status(400).json(ApiResponse.error('Invalid credentials'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json(ApiResponse.error('Invalid credentials'));
    }

    if (!user.isActive) {
      return res.status(403).json(ApiResponse.error('Account is deactivated'));
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Register/update device details if provided
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[LoginWithEmail] Device registered for user ${user.id}`);
        } else {
          console.warn(
            `[LoginWithEmail] Invalid device type: ${deviceType}, skipping device registration`
          );
        }
      } catch (error) {
        // Don't fail login if device registration fails
        console.error('[LoginWithEmail] Error registering device:', error);
      }
    }

    // Prepare comprehensive user object for response
    const [profileFileUrl, coverImageUrl, defaultAddress] = await Promise.all([
      getFileUrlWithStorage(user.profileFile, (user as any).profileFileStorage, 'profile_file'),
      getFileUrlWithStorage(
        (user as any).coverImage,
        (user as any).coverImageStorage,
        'cover_images'
      ),
      // Fetch default address for the user
      (prisma as any).address.findFirst({
        where: {
          userId: user.id,
          isDefault: true,
          deletedAt: null,
        },
      }),
    ]);

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      countryCode: user.countryCode,
      country: (user as any).country ?? null,
      profileFile: profileFileUrl,
      dob: (user as any).dob ?? null,
      coverImage: coverImageUrl,
      userName: (user as any).userName ?? null,
      profession: (user as any).profession ?? null,
      bio: (user as any).bio ?? null,
      instagram: (user as any).instagram ?? null,
      facebook: (user as any).facebook ?? null,
      twitter: (user as any).twitter ?? null,
      isVerified: user.isVerified,
      otpVerified: user.otpVerified,
      stateId: user.stateId,
      isActive: user.isActive,
      roleId: user.roleId,
      // Default address (if exists)
      ...(defaultAddress ? { defaultAddress: AddressResource.transform(defaultAddress) } : {}),
    };

    res.json(
      ApiResponse.success(
        {
          token,
          user: userResponse,
        },
        'Login successful'
      )
    );
  } catch (error) {
    console.error('Email login error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
export const loginWithPhone = async (req: Request, res: Response) => {
  try {
    const { phone, countryCode } = req.body;
    console.log('before here #####');
    const user = await prisma.user.findFirst({
      where: {
        phone: phone,
        countryCode: countryCode,
      },
    });
    console.log('here');
    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (!user.isActive) {
      return res.status(403).json(ApiResponse.error('Account is deactivated'));
    }

    // Generate new OTP
    const otp = generateOTP();

    // Update user with new OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        otpCreatedAt: new Date(),
      },
    });

    // Send OTP
    await sendSMSOTP(`${countryCode}${phone}`, otp);

    res.json(
      ApiResponse.success(
        {
          userId: user.id,
          message: 'Your OTP has been sent to your mobile number.',
        },
        'Your OTP has been sent to your mobile number.'
      )
    );
  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
 *       400:
 *         description: Invalid OTP
 */
export const verifyPhoneLogin = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      otp,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (user.otp !== otp) {
      return res.status(400).json(ApiResponse.error('Invalid OTP'));
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        otpVerified: true,
        otpVerifiedAt: new Date(),
      },
    });

    // Register/update device details if provided
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[VerifyPhoneLogin] Device registered for user ${user.id}`);
        } else {
          console.warn(
            `[VerifyPhoneLogin] Invalid device type: ${deviceType}, skipping device registration`
          );
        }
      } catch (error) {
        // Don't fail login if device registration fails
        console.error('[VerifyPhoneLogin] Error registering device:', error);
      }
    }

    res.json(
      ApiResponse.success(
        {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            countryCode: user.countryCode,
            country: (user as any).country ?? null,
            isVerified: user.isVerified,
            otpVerified: true,
          },
        },
        'Login successful'
      )
    );
  } catch (error) {
    console.error('Phone login verification error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const { phone, countryCode, email } = req.body;

    let user;
    let otpType: 'phone' | 'email';

    // Find user by phone+countryCode or email
    if (phone && countryCode) {
      user = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
        },
      });
      otpType = 'phone';
    } else if (email) {
      user = await prisma.user.findUnique({
        where: { email },
      });
      otpType = 'email';
    } else {
      return res
        .status(400)
        .json(
          ApiResponse.validationErrorSimple(
            'identifier',
            'Please provide either phone+countryCode or email'
          )
        );
    }

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    const otp = generateOTP();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        otpCreatedAt: new Date(),
      },
    });

    // Automatically detect type and send appropriate OTP
    if (otpType === 'phone') {
      // TODO: Integrate with actual SMS service
      console.log(`📱 SMS OTP for ${user.phone}: ${otp} (STATIC - Use this OTP for testing)`);
      res.json(
        ApiResponse.success(
          {
            otp: otp, // Return OTP in response for now
            message: 'Your OTP has been sent to your mobile number.',
            type: 'phone',
          },
          'Your OTP has been sent to your mobile number.'
        )
      );
    } else {
      // TODO: Integrate with actual email service
      console.log(`📧 Email OTP for ${user.email}: ${otp} (STATIC - Use this OTP for testing)`);
      res.json(
        ApiResponse.success(
          {
            otp: otp, // Return OTP in response for now
            message: 'Your OTP has been sent to your email.',
            type: 'email',
          },
          'Your OTP has been sent to your email.'
        )
      );
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
export const userCheck = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has been invalidated'));
    }

    // Find user by ID from token
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (!user.isActive || user.stateId !== 1) {
      return res.status(403).json(ApiResponse.error('Account is inactive'));
    }

    // Prepare user object for response
    const [profileFileUrl, coverImageUrl, defaultAddress] = await Promise.all([
      getFileUrlWithStorage(user.profileFile, (user as any).profileFileStorage, 'profile_file'),
      getFileUrlWithStorage(
        (user as any).coverImage,
        (user as any).coverImageStorage,
        'cover_images'
      ),
      // Fetch default address for the user
      (prisma as any).address.findFirst({
        where: {
          userId: user.id,
          isDefault: true,
          deletedAt: null,
        },
      }),
    ]);

    const userResponse = {
      id: user.id,
      uuid: (user as any).uuid ?? null,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      countryCode: user.countryCode,
      country: (user as any).country ?? null,
      profileFile: profileFileUrl,
      dob: (user as any).dob ?? null,
      coverImage: coverImageUrl,
      userName: (user as any).userName ?? null,
      profession: (user as any).profession ?? null,
      bio: (user as any).bio ?? null,
      instagram: (user as any).instagram ?? null,
      facebook: (user as any).facebook ?? null,
      twitter: (user as any).twitter ?? null,
      subscriptionFee: (user as any).subscriptionFee ? Number((user as any).subscriptionFee) : null,
      isVerified: user.isVerified,
      otpVerified: user.otpVerified,
      stateId: user.stateId,
      isActive: user.isActive,
      roleId: user.roleId,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      // User stats
      postsCount: (user as any).postsCount ?? 0,
      subscribersCount: (user as any).subscribersCount ?? 0,
      subscribedCount: (user as any).followingCount ?? 0,
      likesReceivedCount: (user as any).likesReceivedCount ?? 0,
      // Default address (if exists)
      ...(defaultAddress ? { defaultAddress: AddressResource.transform(defaultAddress) } : {}),
    };

    res.json(
      ApiResponse.success(
        {
          user: userResponse,
        },
        'User details retrieved successfully'
      )
    );
  } catch (error) {
    console.error('User check error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

/**
 * @swagger
 * /mobile/auth/update-profile:
 *   patch:
 *     summary: Update user profile (individual fields)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Full name
 *               firstName:
 *                 type: string
 *                 description: First name
 *               lastName:
 *                 type: string
 *                 description: Last name
 *               phone:
 *                 type: string
 *                 description: Phone number
 *               countryCode:
 *                 type: string
 *                 description: Country code
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address
 *               profileFile:
 *                 type: string
 *                 description: Profile image URL
 *               dob:
 *                 type: string
 *                 format: date
 *                 description: Date of birth (YYYY-MM-DD)
 *               coverImage:
 *                 type: string
 *                 description: Cover image URL
 *               userName:
 *                 type: string
 *               profession:
 *                 type: string
 *               bio:
 *                 type: string
 *               instagram:
 *                 type: string
 *               facebook:
 *                 type: string
 *               twitter:
 *                 type: string
 *               subscriptionFee:
 *                 type: number
 *                 description: Subscription fee amount
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Invalid or expired token
 *       400:
 *         description: Validation error
 */
export const updateProfile = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    const {
      name,
      firstName,
      lastName,
      phone,
      countryCode,
      password,
      dob,
      userName,
      profession,
      bio,
      instagram,
      facebook,
      twitter,
      subscriptionFee,
    } = req.body;

    // Handle file uploads (optimized for parallel processing)
    let profileFileUrl = null;
    let coverImageUrl = null;

    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const fs = require('fs').promises;
      const uploadPromises: Promise<void>[] = [];

      // Handle profile file
      if (files.profileFile && files.profileFile[0]) {
        const profileFile = files.profileFile[0];
        const profileFileName = `profile_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(profileFile.originalname)}`;
        const profileFilePath = path.join('public/uploads/profile_file', profileFileName);
        const profileDir = path.dirname(profileFilePath);

        uploadPromises.push(
          fs
            .mkdir(profileDir, { recursive: true })
            .then(() => fs.writeFile(profileFilePath, profileFile.buffer))
            .then(() => {
              profileFileUrl = `/uploads/profile_file/${profileFileName}`;
            })
            .catch((error: any) => {
              console.error('Error processing profile file:', error);
              throw error;
            })
        );
      }

      // Handle cover image
      if (files.coverImage && files.coverImage[0]) {
        const coverFile = files.coverImage[0];
        const coverFileName = `cover_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(coverFile.originalname)}`;
        const coverFilePath = path.join('public/uploads/cover_images', coverFileName);
        const coverDir = path.dirname(coverFilePath);

        uploadPromises.push(
          fs
            .mkdir(coverDir, { recursive: true })
            .then(() => fs.writeFile(coverFilePath, coverFile.buffer))
            .then(() => {
              coverImageUrl = `/uploads/cover_images/${coverFileName}`;
            })
            .catch((error: any) => {
              console.error('Error processing cover image:', error);
              throw error;
            })
        );
      }

      // Wait for all uploads to complete in parallel
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }
    }

    // Get current storage type for storing with file paths
    const currentStorageType = getCurrentStorageType();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        isActive: true,
        stateId: true,
        phone: true,
        countryCode: true,
        profileFile: true,
        coverImage: true,
      },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (!user.isActive || user.stateId !== 1) {
      return res.status(403).json(ApiResponse.error('Account is inactive'));
    }

    // Get storage provider for deleting old files
    const storage = getStorageProvider();

    // Helper function to extract file key from stored path
    const extractFileKey = (filePath: string | null): string | null => {
      if (!filePath) return null;
      // Remove /uploads/ prefix if present
      let cleaned = filePath.startsWith('/uploads/')
        ? filePath.slice('/uploads/'.length)
        : filePath.replace(/^\/+/, '');
      // Remove any leading slashes
      cleaned = cleaned.replace(/^\/+/, '');
      return cleaned || null;
    };

    // Store old file paths for deletion
    const oldProfileFile = user.profileFile;
    const oldCoverImage = user.coverImage;

    // Check if phone is being updated and if it already exists
    if (phone && countryCode && (phone !== user.phone || countryCode !== user.countryCode)) {
      const existingUser = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
        },
      });
      if (existingUser) {
        return res.status(400).json(ApiResponse.error('Phone number already exists'));
      }
    }

    // Prepare update data (only include fields that are provided and not empty)
    const updateData: any = {};
    if (name !== undefined && name !== '') updateData.name = name;
    if (firstName !== undefined && firstName !== '') updateData.firstName = firstName;
    if (lastName !== undefined && lastName !== '') updateData.lastName = lastName;
    if (phone !== undefined && phone !== '') updateData.phone = phone;
    if (countryCode !== undefined && countryCode !== '') updateData.countryCode = countryCode;
    if (profileFileUrl !== null) {
      updateData.profileFile = profileFileUrl;
      updateData.profileFileStorage = currentStorageType;
    }
    if (dob !== undefined && dob !== '') updateData.dob = new Date(dob);
    if (coverImageUrl !== null) {
      updateData.coverImage = coverImageUrl;
      updateData.coverImageStorage = currentStorageType;
    }
    if (userName !== undefined && userName !== '') updateData.userName = userName;
    if (profession !== undefined && profession !== '') updateData.profession = profession;
    if (bio !== undefined && bio !== '') updateData.bio = bio;
    if (instagram !== undefined && instagram !== '') updateData.instagram = instagram;
    if (facebook !== undefined && facebook !== '') updateData.facebook = facebook;
    if (twitter !== undefined && twitter !== '') updateData.twitter = twitter;
    if (subscriptionFee !== undefined && subscriptionFee !== null && subscriptionFee !== '') {
      updateData.subscriptionFee = subscriptionFee;
    }
    if (password !== undefined && password !== '') {
      // Hash password if provided
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Check if at least one field is being updated (including file uploads)
    const hasFileUploads = req.files && Object.keys(req.files).length > 0;
    const hasFormFields = Object.keys(updateData).length > 0;

    if (!hasFormFields && !hasFileUploads) {
      return res
        .status(400)
        .json(ApiResponse.error('At least one field must be provided for update'));
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Delete old files asynchronously (non-blocking) - don't wait for deletion before responding
    // This ensures fast response times while cleanup happens in background
    if (profileFileUrl !== null && oldProfileFile) {
      const oldFileKey = extractFileKey(oldProfileFile);
      if (oldFileKey) {
        // Fire and forget - don't await
        storage.delete(oldFileKey).catch(err => {
          console.warn('Failed to delete old profile file:', oldFileKey, err);
        });
      }
    }

    if (coverImageUrl !== null && oldCoverImage) {
      const oldFileKey = extractFileKey(oldCoverImage);
      if (oldFileKey) {
        // Fire and forget - don't await
        storage.delete(oldFileKey).catch(err => {
          console.warn('Failed to delete old cover image:', oldFileKey, err);
        });
      }
    }

    // Prepare user object for response
    const [responseProfileFileUrl, responseCoverImageUrl] = await Promise.all([
      getFileUrlWithStorage(
        updatedUser.profileFile,
        (updatedUser as any).profileFileStorage,
        'profile_file'
      ),
      getFileUrlWithStorage(
        (updatedUser as any).coverImage,
        (updatedUser as any).coverImageStorage,
        'cover_images'
      ),
    ]);

    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      countryCode: updatedUser.countryCode,
      country: (updatedUser as any).country ?? null,
      profileFile: responseProfileFileUrl,
      dob: (updatedUser as any).dob ?? null,
      coverImage: responseCoverImageUrl,
      userName: (updatedUser as any).userName ?? null,
      profession: (updatedUser as any).profession ?? null,
      bio: (updatedUser as any).bio ?? null,
      instagram: (updatedUser as any).instagram ?? null,
      facebook: (updatedUser as any).facebook ?? null,
      twitter: (updatedUser as any).twitter ?? null,
      subscriptionFee: (updatedUser as any).subscriptionFee
        ? Number((updatedUser as any).subscriptionFee)
        : null,
      isVerified: updatedUser.isVerified,
      otpVerified: updatedUser.otpVerified,
      stateId: updatedUser.stateId,
      isActive: updatedUser.isActive,
      roleId: updatedUser.roleId,
    };

    res.json(
      ApiResponse.success(
        {
          user: userResponse,
        },
        'Profile updated successfully'
      )
    );
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
export const setupPassword = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    const { password } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found'));
    }

    if (!user.isActive || user.stateId !== 1) {
      return res.status(403).json(ApiResponse.error('Account is inactive'));
    }

    // Only verify email - comment out phone verification
    if (!user.isVerified) {
      return res.status(400).json(ApiResponse.error('Please verify your email first'));
    }

    // Comment out phone verification requirement
    // if (!user.isVerified || !user.otpVerified) {
    //   return res.status(400).json(ApiResponse.error('Please verify your phone and email first'));
    // }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user with password
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    // Prepare user object for response
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone: updatedUser.phone,
      countryCode: updatedUser.countryCode,
      country: (updatedUser as any).country ?? null,
      isVerified: updatedUser.isVerified,
      otpVerified: updatedUser.otpVerified,
      stateId: updatedUser.stateId,
      isActive: updatedUser.isActive,
      roleId: updatedUser.roleId,
    };

    res.json(
      ApiResponse.success(
        {
          user: userResponse,
        },
        'Password set up successfully'
      )
    );
  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

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
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Validation error
 */
export const login = async (req: Request, res: Response) => {
  try {
    const {
      email,
      phone,
      countryCode,
      password,
      // Device details for push notifications (optional)
      fcmToken,
      deviceType,
      deviceId,
      deviceName,
      osVersion,
      appVersion,
    } = req.body;

    let user;

    // Find user by email or phone
    if (email) {
      // Login with email
      user = await prisma.user.findUnique({
        where: { email },
      });
    } else if (phone && countryCode) {
      // Login with phone + countryCode
      user = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
        },
      });
    } else {
      return res
        .status(400)
        .json(
          ApiResponse.validationErrorSimple(
            'credentials',
            'Please provide either email+password or phone+countryCode+password'
          )
        );
    }

    if (!user) {
      return res.status(400).json(ApiResponse.error('Invalid credentials'));
    }

    // Check if user has a password set up
    if (!user.password) {
      return res.status(400).json(ApiResponse.error('Please set up your password first'));
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json(ApiResponse.error('Invalid credentials'));
    }

    if (!user.isActive || user.stateId !== 1) {
      return res.status(403).json(ApiResponse.error('Account is inactive'));
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Register/update device details if provided (similar to classified ads)
    if (fcmToken && deviceType) {
      try {
        const { DeviceService } =
          await import('../../modules/notifications/services/device.service');
        const deviceService = new DeviceService();

        // Validate device type: 1 = ios, 2 = android, 3 = web
        if (deviceType === 1 || deviceType === 2 || deviceType === 3) {
          await deviceService.registerDevice(user.id, {
            fcmToken,
            deviceType,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            osVersion: osVersion || null,
            appVersion: appVersion || null,
          });
          console.log(`[Login] Device registered for user ${user.id}`);
        } else {
          console.warn(`[Login] Invalid device type: ${deviceType}, skipping device registration`);
        }
      } catch (error) {
        // Don't fail login if device registration fails
        console.error('[Login] Error registering device:', error);
      }
    }

    // Prepare comprehensive user object for response
    // Construct name from firstName and lastName if name is null
    const fullName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;

    const [profileFileUrl, coverImageUrl, defaultAddress] = await Promise.all([
      getFileUrlWithStorage(user.profileFile, (user as any).profileFileStorage, 'profile_file'),
      getFileUrlWithStorage(
        (user as any).coverImage,
        (user as any).coverImageStorage,
        'cover_images'
      ),
      // Fetch default address for the user
      (prisma as any).address.findFirst({
        where: {
          userId: user.id,
          isDefault: true,
          deletedAt: null,
        },
      }),
    ]);

    const userResponse = {
      id: user.id,
      email: user.email,
      name: fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      countryCode: user.countryCode,
      country: (user as any).country ?? null,
      profileFile: profileFileUrl,
      dob: (user as any).dob ?? null,
      coverImage: coverImageUrl,
      userName: (user as any).userName ?? null,
      profession: (user as any).profession ?? null,
      bio: (user as any).bio ?? null,
      instagram: (user as any).instagram ?? null,
      facebook: (user as any).facebook ?? null,
      twitter: (user as any).twitter ?? null,
      isVerified: user.isVerified,
      otpVerified: user.otpVerified,
      stateId: user.stateId,
      isActive: user.isActive,
      roleId: user.roleId,
      // Default address (if exists)
      ...(defaultAddress ? { defaultAddress: AddressResource.transform(defaultAddress) } : {}),
    };

    res.json(
      ApiResponse.success(
        {
          token,
          user: userResponse,
        },
        'Login successful'
      )
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

// Pages CRUD Controllers
export const PageType = {
  privacy_policy: 1,
  terms_of_service: 2,
  data_processing_agreement: 3,
  faq: 4,
  about_us: 5,
  contact_us: 6,
} as const;

const allowedPageTypeValues = Object.values(PageType) as number[];
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
 *               typeId:
 *                 type: string
 *                 default: "0"
 *               createdById:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Page created
 *       400:
 *         description: Validation error
 */
export const createPage = async (req: Request, res: Response) => {
  try {
    const { title, description, stateId = 1, createdById = null } = req.body ?? {};
    const typeIdParam = req.params.typeId;

    if (!title || !description || typeIdParam === undefined || typeIdParam === null) {
      return res.status(400).json(ApiResponse.error('title, description and typeId are required'));
    }

    const typeNumeric = Number(typeIdParam);
    if (!allowedPageTypeValues.includes(typeNumeric)) {
      return res.status(400).json(ApiResponse.error('Invalid typeId'));
    }

    const typeIdStored = String(typeNumeric);
    const existingOfType = await (prisma as any).page.findFirst({
      where: { typeId: typeIdStored },
    });
    if (existingOfType) {
      return res.status(409).json(ApiResponse.error('Page of this type already exists'));
    }

    const page = await (prisma as any).page.create({
      data: {
        title,
        description,
        stateId,
        typeId: typeIdStored,
        createdById,
      },
    });

    return res.status(201).json(ApiResponse.success(page, 'Page created'));
  } catch (error) {
    console.error('Create page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};
/**
 * @swagger
 * /mobile/auth/pages:
 *   get:
 *     summary: List pages
 *     tags: [Mobile Auth]
 *     responses:
 *       200:
 *         description: Pages list
 */
export const listPages = async (req: Request, res: Response) => {
  try {
    const { typeId } = req.query as any;

    const where: any = {};
    if (typeId !== undefined) {
      const parsedTypeId = parseInt(String(typeId), 10);
      if (!isNaN(parsedTypeId) && allowedPageTypeValues.includes(parsedTypeId)) {
        where.typeId = String(parsedTypeId);
      }
    }

    const pages = await (prisma as any).page.findMany({
      where,
      orderBy: { id: 'desc' },
    });
    return res.json(ApiResponse.success(pages, 'Pages list'));
  } catch (error) {
    console.error('List pages error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};
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
export const getPageById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json(ApiResponse.error('Invalid id'));
    }
    const page = await (prisma as any).page.findUnique({ where: { id } });
    if (!page) return res.status(404).json(ApiResponse.error('Page not found'));
    return res.json(ApiResponse.success(page, 'Page details'));
  } catch (error) {
    console.error('Get page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const getPageByTypeId = async (req: Request, res: Response) => {
  try {
    const { typeId } = req.params;
    const parsedTypeId = parseInt(String(typeId), 10);

    if (isNaN(parsedTypeId) || !allowedPageTypeValues.includes(parsedTypeId)) {
      return res.status(400).json(ApiResponse.error('Invalid type ID'));
    }

    const page = await (prisma as any).page.findFirst({
      where: { typeId: String(parsedTypeId) },
    });

    if (!page) return res.status(404).json(ApiResponse.error('Page not found'));
    return res.json(ApiResponse.success(page, 'Page details'));
  } catch (error) {
    console.error('Get page by type error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};
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
 *                 type: string
 *     responses:
 *       200:
 *         description: Page updated
 *       404:
 *         description: Page not found
 */
export const updatePage = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json(ApiResponse.error('Invalid id'));
    }

    const { title, description, stateId, typeId } = req.body ?? {};

    const existing = await (prisma as any).page.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(ApiResponse.error('Page not found'));

    // If typeId is changing, ensure not creating duplicate of another type
    if (typeId !== undefined) {
      const typeNumeric = Number(typeId);
      if (!allowedPageTypeValues.includes(typeNumeric)) {
        return res.status(400).json(ApiResponse.error('Invalid typeId'));
      }
      const typeIdStored = String(typeNumeric);
      const duplicate = await (prisma as any).page.findFirst({
        where: { typeId: typeIdStored, NOT: { id } },
      });
      if (duplicate) {
        return res.status(409).json(ApiResponse.error('Page of this type already exists'));
      }
    }

    const page = await (prisma as any).page.update({
      where: { id },
      data: {
        title,
        description,
        stateId,
        typeId: typeId !== undefined ? String(Number(typeId)) : undefined,
        updatedAt: new Date(),
      },
    });
    return res.json(ApiResponse.success(page, 'Page updated'));
  } catch (error) {
    console.error('Update page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};
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
export const deletePage = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json(ApiResponse.error('Invalid id'));
    }

    const existing = await (prisma as any).page.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(ApiResponse.error('Page not found'));

    await (prisma as any).page.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete page error:', error);
    return res.status(500).json(ApiResponse.error('Server error'));
  }
};

// Forgot Password Function

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
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found with this email address'));
    }

    const otp = generateOTP();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        otpCreatedAt: new Date(),
      },
    });

    console.log(
      `📧 Password Reset OTP for ${user.email}: ${otp} (STATIC - Use this OTP for testing)`
    );

    res.json(
      ApiResponse.success(
        {
          otp: otp,
          message: 'Your OTP has been sent to your email.',
          email: user.email,
        },
        'Your OTP has been sent to your email.'
      )
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

// Logout Function

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
export const logout = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header (same logic as other mobile endpoints)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is already blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has already been invalidated'));
    }

    const userId = decoded.userId;

    if (userId) {
      // Add current token to blacklist
      const tokenExpiry = new Date(decoded.exp * 1000); // Convert JWT exp to Date
      await prisma.tokenBlacklist.create({
        data: {
          token: token,
          expiresAt: tokenExpiry,
        },
      });

      // Delete tokens from authToken table if they exist
      await prisma.authToken.deleteMany({
        where: {
          userId: userId,
        },
      });

      await prisma.refreshToken.deleteMany({
        where: {
          userId: userId,
        },
      });

      console.log(`📱 User ${userId} logged out successfully`);
    }

    res.json(ApiResponse.success(null, 'Logged out successfully'));
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json(ApiResponse.error('Server error during logout'));
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header (same logic as other mobile endpoints)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has been invalidated'));
    }

    const userId = decoded.userId;

    // Ensure user exists and is active
    const user = await prisma.user.findUnique({ where: { id: userId! } });
    if (!user || user.deletedAt) {
      return res.status(404).json(ApiResponse.notFound('User not found'));
    }

    // Only set state_id to Deleted (4). Do not alter anything else.
    await prisma.user.update({
      where: { id: userId! },
      data: {
        stateId: 4,
      },
    });

    return res.status(200).json(ApiResponse.success(null, 'Account deleted successfully'));
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json(ApiResponse.serverError('Error deleting account'));
  }
};

export const deleteAccountPermanent = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header (same logic as other mobile endpoints)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has been invalidated'));
    }

    const userId = decoded.userId;

    const user = await prisma.user.findUnique({ where: { id: userId! } });
    if (!user) {
      return res.status(404).json(ApiResponse.notFound('User not found'));
    }

    // Delete related tokens first (defensive; relations also set to cascade)
    await prisma.$transaction([
      prisma.authToken.deleteMany({ where: { userId: userId! } }),
      prisma.refreshToken.deleteMany({ where: { userId: userId! } }),
    ]);

    // Permanently delete user
    await prisma.user.delete({ where: { id: userId! } });

    return res.status(200).json(ApiResponse.success(null, 'Account permanently deleted'));
  } catch (error) {
    console.error('Permanent delete account error:', error);
    return res.status(500).json(ApiResponse.serverError('Error deleting account permanently'));
  }
};

/**
 * @swagger
 * /mobile/auth/update-contact:
 *   post:
 *     summary: Request to update email/phone/country (generates OTP)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address (optional)
 *               phone:
 *                 type: string
 *                 description: New phone number (optional)
 *               countryCode:
 *                 type: string
 *                 description: New country code (required if phone provided)
 *               country:
 *                 type: string
 *                 description: New ISO 2-letter country code (optional, e.g., US, CA, GB)
 *     responses:
 *       200:
 *         description: OTP generated and sent successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 *       422:
 *         description: Email or phone number already associated with another account
 */
export const updateContact = async (req: Request, res: Response) => {
  try {
    // Get userId from mobileAuthStrict middleware
    const userId = (req as any).userId;
    const { email, phone, countryCode, country } = req.body;

    // Validate that at least one field is provided
    if (!email && !phone) {
      return res
        .status(400)
        .json(ApiResponse.error('Please provide either email or phone to update'));
    }

    // Check if email already exists (excluding current user)
    if (email) {
      const existingUserByEmail = await prisma.user.findFirst({
        where: {
          email: email,
          id: { not: userId },
        },
      });
      if (existingUserByEmail) {
        return res
          .status(422)
          .json(ApiResponse.error('Email already associated with another account'));
      }
    }

    // Check if phone already exists (excluding current user)
    if (phone && countryCode) {
      const existingUserByPhone = await prisma.user.findFirst({
        where: {
          phone: phone,
          countryCode: countryCode,
          id: { not: userId },
        },
      });
      if (existingUserByPhone) {
        return res
          .status(422)
          .json(ApiResponse.error('Phone number already associated with another account'));
      }
    }

    // Generate OTP
    const otp = generateOTP();

    // Update user with OTP
    await prisma.user.update({
      where: { id: userId },
      data: {
        otp,
        otpCreatedAt: new Date(),
      },
    });

    // Determine message based on what's being updated
    let message = '';
    if (email && phone && countryCode) {
      message = 'Your OTP has been sent to your mobile number and email.';
    } else if (email) {
      message = 'Your OTP has been sent to your email.';
    } else if (phone && countryCode) {
      message = 'Your OTP has been sent to your mobile number.';
    }

    // Send OTP via email if email is being updated
    if (email) {
      console.log(`📧 Email OTP for ${email}: ${otp} (STATIC - Use this OTP for testing)`);
    }

    // Send OTP via SMS if phone is being updated
    if (phone && countryCode) {
      console.log(
        `📱 SMS OTP for ${countryCode}${phone}: ${otp} (STATIC - Use this OTP for testing)`
      );
    }

    res.json(
      ApiResponse.success(
        {
          otp: otp, // Return OTP in response for testing
          message: message,
          type: email && phone ? 'both' : email ? 'email' : 'phone',
        },
        message
      )
    );
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json(ApiResponse.error('Server error'));
  }
};

export const changePasswordMobile = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header (same logic as other mobile endpoints)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has been invalidated'));
    }

    const userId = decoded.userId;

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(404).json(ApiResponse.notFound('User not found'));
    }

    if (!user.password) {
      return res.status(400).json(ApiResponse.error('No password set for this account'));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json(ApiResponse.error('Current password is incorrect'));
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    return res.status(200).json(ApiResponse.success(null, 'Password changed successfully'));
  } catch (error) {
    console.error('Mobile change password error:', error);
    return res.status(500).json(ApiResponse.serverError('Error changing password'));
  }
};

/**
 * Verify OTP and update user profile data
 */
export const verifyOTPAndUpdateProfile = async (req: Request, res: Response) => {
  try {
    // Extract token from Authorization header (same logic as other mobile endpoints)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ApiResponse.error('No token provided'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
      return res.status(401).json(ApiResponse.error('Invalid or expired token'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json(ApiResponse.error('Token has been revoked'));
    }

    const { otp, email, phone, countryCode, country } = req.body;
    const userId = decoded.userId; // Get userId from JWT token

    // Verify OTP and update user data
    const result = await OTPService.verifyOTPAndUpdate(
      userId,
      otp,
      email,
      phone,
      countryCode,
      country
    );

    if (!result.success) {
      return res.status(400).json(ApiResponse.error(result.message));
    }

    return res.status(200).json(ApiResponse.success(result.data, result.message));
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json(ApiResponse.serverError('Error verifying OTP'));
  }
};
