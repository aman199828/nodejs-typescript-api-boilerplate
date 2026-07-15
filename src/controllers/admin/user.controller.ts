import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import { ApiResponse } from '../../resources/ApiResponse';
import config from '../../config/config';
import { getFileUrl } from '../../utils/file.utils';

// const prisma = new PrismaClient();

// Role constants for better type safety and maintainability
const ROLE = {
  ADMIN: 1,
  USER: 2,
} as const;

// User State constants matching the Laravel model
const USER_STATE = {
  INACTIVE: 0,
  ACTIVE: 1,
  PENDING: 3,
  DELETED: 4,
  REJECTED: 5,
  BLOCKED: 6,
} as const;

// Helper functions to generate dynamic URLs for mobile display

const getCoverImageUrl = (coverImage: string | null): string | null => {
  if (!coverImage) return null;

  // If it's already a full URL, return as is
  if (coverImage.startsWith('http')) {
    return coverImage;
  }

  // Normalize filePath: strip /uploads/ prefix if present
  const cleaned = coverImage.startsWith('/uploads/')
    ? coverImage.slice('/uploads/'.length)
    : coverImage.replace(/^\/+/, '');

  // Extract folder and filename
  const parts = cleaned.split('/').filter(Boolean);
  const folder = parts[0];
  const filename = parts.slice(1).join('/');

  if (!folder || !filename) return null;

  // Construct the full URL for cover image download
  return `${config.APP_URL}/file/download/${folder}/${filename}`;
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy,
      sortOrder = 'desc',
      isActive,
      isVerified,
      roleId,
      createdAtFrom,
      createdAtTo,
    } = req.query as any;

    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};
    // Always exclude admin accounts from listing
    const andConditions: any[] = [{ roleId: { not: ROLE.ADMIN } }];

    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    }
    if (isVerified !== undefined) {
      where.isVerified = isVerified === 'true' || isVerified === true;
    }
    if (roleId !== undefined) {
      const parsedRoleId = parseInt(String(roleId), 10);
      if (!isNaN(parsedRoleId)) {
        // Apply requested role filter while still excluding admins
        andConditions.push({ roleId: parsedRoleId });
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { countryCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(String(createdAtFrom));
      if (createdAtTo) where.createdAt.lte = new Date(String(createdAtTo));
    }

    const orderBy = sortBy
      ? { [sortBy as string]: (sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc' }
      : { createdAt: 'desc' as const };

    // Apply AND conditions (excludes admins and optional role filter)
    if (andConditions.length > 0) {
      (where as any).AND = andConditions;
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          countryCode: true,
          userName: true,
          firstName: true,
          lastName: true,
          profileFile: true,
          coverImage: true,
          profession: true,
          bio: true,
          dob: true,
          instagram: true,
          facebook: true,
          twitter: true,
          isActive: true,
          isVerified: true,
          emailVerifiedAt: true,
          otpVerified: true,
          otpVerifiedAt: true,
          lastLoginAt: true,
          roleId: true,
          stateId: true,
          typeId: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        } as any,
        orderBy: orderBy as any,
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    const transformed = data.map((user: any) => ({
      ...user,
      isAdmin: (user as any).roleId === ROLE.ADMIN,
      profileFile: getFileUrl(user.profileFile, 'profile_file'),
      coverImage: getCoverImageUrl(user.coverImage),
    }));

    const totalPages = Math.ceil(total / limitNum) || 1;

    const meta = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.json(ApiResponse.success(transformed, 'Users list', 200, meta));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        countryCode: true,
        userName: true,
        firstName: true,
        lastName: true,
        profileFile: true,
        coverImage: true,
        profession: true,
        bio: true,
        dob: true,
        instagram: true,
        facebook: true,
        twitter: true,
        isActive: true,
        isVerified: true,
        emailVerifiedAt: true,
        otpVerified: true,
        otpVerifiedAt: true,
        lastLoginAt: true,
        roleId: true,
        stateId: true,
        typeId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      } as any,
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Transform the response to include a computed isAdmin field and dynamic URLs
    const userWithAdminFlag = {
      ...user,
      isAdmin: (user as any).roleId === ROLE.ADMIN,
      profileFile: getFileUrl((user as any).profileFile, 'profile_file'),
      coverImage: getCoverImageUrl((user as any).coverImage),
    };

    return res.json(ApiResponse.success(userWithAdminFlag, 'User retrieved successfully', 200));
  } catch (error) {
    console.error('Get user by ID error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, roleId } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        email,
        password: hashedPassword,
        roleId: roleId || ROLE.USER, // Default to regular user role
        isActive: true,
        isVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        firstName: true,
        lastName: true,
        roleId: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Transform the response to include a computed isAdmin field
    res.status(201).json({
      ...user,
      isAdmin: user.roleId === ROLE.ADMIN,
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    const {
      firstName,
      lastName,
      email,
      phone,
      countryCode,
      profileFile,
      coverImage,
      userName,
      profession,
      dob,
      bio,
      instagram,
      facebook,
      twitter,
      roleId,
      isActive,
      isVerified,
      stateId,
      typeId,
      password,
    } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: {
        id: true,
        email: true,
        phone: true,
        userName: true,
        firstName: true,
        lastName: true,
        name: true,
        roleId: true,
        isActive: true,
        isVerified: true,
        stateId: true,
        typeId: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: parseInt(idStr, 10) },
        },
      });

      if (emailExists) {
        return res.status(400).json(ApiResponse.error('Email already in use', 400));
      }
    }

    // Check if phone is already taken by another user
    if (phone && phone !== existingUser.phone) {
      const phoneExists = await prisma.user.findFirst({
        where: {
          phone,
          NOT: { id: parseInt(idStr, 10) },
        },
      });

      if (phoneExists) {
        return res.status(400).json(ApiResponse.error('Phone number already in use', 400));
      }
    }

    // Check if userName is already taken by another user
    if (userName && userName !== existingUser.userName) {
      const userNameExists = await prisma.user.findFirst({
        where: {
          userName,
          NOT: { id: parseInt(idStr, 10) },
        },
      });

      if (userNameExists) {
        return res.status(400).json(ApiResponse.error('Username already in use', 400));
      }
    }

    // Prepare update data
    const updateData: any = {};

    // Update basic profile fields
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (countryCode !== undefined) updateData.countryCode = countryCode;
    if (userName !== undefined) updateData.userName = userName;

    // Update profile media
    if (profileFile !== undefined) updateData.profileFile = profileFile;
    if (coverImage !== undefined) updateData.coverImage = coverImage;

    // Update professional info
    if (profession !== undefined) updateData.profession = profession;
    if (bio !== undefined) updateData.bio = bio;

    // Update social media links
    if (instagram !== undefined) updateData.instagram = instagram;
    if (facebook !== undefined) updateData.facebook = facebook;
    if (twitter !== undefined) updateData.twitter = twitter;

    // Update date of birth
    if (dob !== undefined) updateData.dob = dob ? new Date(dob) : null;

    // Update role and status
    if (roleId !== undefined) updateData.roleId = roleId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (stateId !== undefined) updateData.stateId = stateId;
    if (typeId !== undefined) updateData.typeId = typeId;

    // Update password if provided
    if (password !== undefined && password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    // Update full name if firstName or lastName changed
    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName : existingUser.firstName;
      const newLastName = lastName !== undefined ? lastName : existingUser.lastName;
      updateData.name = `${newFirstName || ''} ${newLastName || ''}`.trim();
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        countryCode: true,
        userName: true,
        firstName: true,
        lastName: true,
        profileFile: true,
        coverImage: true,
        profession: true,
        dob: true,
        instagram: true,
        facebook: true,
        twitter: true,
        bio: true,
        isActive: true,
        isVerified: true,
        roleId: true,
        stateId: true,
        typeId: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    });

    // Transform the response to include dynamic URLs
    const userWithDynamicUrls = {
      ...updatedUser,
      profileFile: getFileUrl((updatedUser as any).profileFile, 'profile_file'),
      coverImage: getCoverImageUrl((updatedUser as any).coverImage),
    };

    return res.json(ApiResponse.success(userWithDynamicUrls, 'User updated successfully', 200));
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
      },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Prevent deleting self
    if (user.id === (req as any).user.userId) {
      return res.status(400).json(ApiResponse.error('Cannot delete your own account', 400));
    }

    // Prevent deleting other admin accounts (optional safety check)
    if (user.roleId === ROLE.ADMIN) {
      return res.status(400).json(ApiResponse.error('Cannot delete admin accounts', 400));
    }

    // Perform permanent delete
    await prisma.user.delete({
      where: { id: parseInt(idStr, 10) },
    });

    // Log the deletion (optional - you might want to add audit logging)
    console.log(`User permanently deleted: ID=${user.id}, Email=${user.email}`);

    return res.json(
      ApiResponse.success(
        {
          deletedUserId: user.id,
          deletedUserEmail: user.email,
          deletedAt: new Date(),
        },
        'User permanently deleted successfully',
        200
      )
    );
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Toggle active status
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({
      message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update user status to inactive
 */
export const setUserInactive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: { id: true, name: true, email: true, stateId: true },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Prevent admin from deactivating themselves
    if (user.id === (req as any).user.userId) {
      return res.status(400).json(ApiResponse.error('Cannot deactivate your own account', 400));
    }

    // Update user status to inactive
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: {
        stateId: USER_STATE.INACTIVE,
        isActive: false, // Also set isActive to false for consistency
      },
      select: {
        id: true,
        name: true,
        email: true,
        stateId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return res.json(
      ApiResponse.success(updatedUser, 'User status updated to inactive successfully', 200)
    );
  } catch (error) {
    console.error('Set user inactive error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

/**
 * Update user status to active
 */
export const setUserActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: { id: true, name: true, email: true, stateId: true },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Update user status to active
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: {
        stateId: USER_STATE.ACTIVE,
        isActive: true, // Also set isActive to true for consistency
      },
      select: {
        id: true,
        name: true,
        email: true,
        stateId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return res.json(
      ApiResponse.success(updatedUser, 'User status updated to active successfully', 200)
    );
  } catch (error) {
    console.error('Set user active error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

/**
 * Update user status to deleted (soft delete)
 */
export const setUserDeleted = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: { id: true, name: true, email: true, stateId: true },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Prevent admin from deleting themselves
    if (user.id === (req as any).user.userId) {
      return res.status(400).json(ApiResponse.error('Cannot delete your own account', 400));
    }

    // Update user status to deleted
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: {
        stateId: USER_STATE.DELETED,
        isActive: false, // Also set isActive to false
        deletedAt: new Date(), // Set deletion timestamp
      },
      select: {
        id: true,
        name: true,
        email: true,
        stateId: true,
        isActive: true,
        deletedAt: true,
        updatedAt: true,
      },
    });

    return res.json(
      ApiResponse.success(updatedUser, 'User status updated to deleted successfully', 200)
    );
  } catch (error) {
    console.error('Set user deleted error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

/**
 * Toggle user state by state ID
 */
export const toggleUserState = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    const { stateId } = req.body;

    // Validate state ID
    const validStates = Object.values(USER_STATE);
    if (!validStates.includes(stateId)) {
      return res
        .status(400)
        .json(
          ApiResponse.error(`Invalid state ID. Valid states are: ${validStates.join(', ')}`, 400)
        );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(idStr, 10) },
      select: { id: true, name: true, email: true, stateId: true },
    });

    if (!user) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Prevent admin from changing their own state to inactive or deleted
    if (
      user.id === (req as any).user.userId &&
      (stateId === USER_STATE.INACTIVE || stateId === USER_STATE.DELETED)
    ) {
      return res
        .status(400)
        .json(ApiResponse.error('Cannot set your own account to inactive or deleted', 400));
    }

    // Prepare update data
    const updateData: any = { stateId };

    // Set isActive based on state
    if (stateId === USER_STATE.ACTIVE) {
      updateData.isActive = true;
    } else if (stateId === USER_STATE.INACTIVE || stateId === USER_STATE.DELETED) {
      updateData.isActive = false;
    }

    // Set deletedAt for deleted state
    if (stateId === USER_STATE.DELETED) {
      updateData.deletedAt = new Date();
    } else {
      updateData.deletedAt = null;
    }

    // Update user state
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(idStr, 10) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        stateId: true,
        isActive: true,
        deletedAt: true,
        updatedAt: true,
      },
    });

    // Get state name for response message
    const stateNames = {
      [USER_STATE.INACTIVE]: 'Inactive',
      [USER_STATE.ACTIVE]: 'Active',
      [USER_STATE.PENDING]: 'Pending',
      [USER_STATE.DELETED]: 'Deleted',
      [USER_STATE.REJECTED]: 'Rejected',
      [USER_STATE.BLOCKED]: 'Blocked',
    };

    const stateName = stateNames[stateId as keyof typeof stateNames] || 'Unknown';

    return res.json(
      ApiResponse.success(updatedUser, `User state updated to ${stateName} successfully`, 200)
    );
  } catch (error) {
    console.error('Toggle user state error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};

/**
 * Get user status options for reference
 */
export const getUserStatusOptions = async (req: Request, res: Response) => {
  try {
    const statusOptions = {
      [USER_STATE.INACTIVE]: 'Inactive',
      [USER_STATE.ACTIVE]: 'Active',
      [USER_STATE.PENDING]: 'Pending',
      [USER_STATE.DELETED]: 'Deleted',
      [USER_STATE.REJECTED]: 'Rejected',
      [USER_STATE.BLOCKED]: 'Blocked',
    };

    return res.json(
      ApiResponse.success(statusOptions, 'User status options retrieved successfully', 200)
    );
  } catch (error) {
    console.error('Get user status options error:', error);
    return res.status(500).json(ApiResponse.error('Server error', 500));
  }
};
