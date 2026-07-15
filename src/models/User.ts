// Replacing Prisma type import with a local interface to avoid removed generated types
// import { User as PrismaUser } from '../../generated/prisma';
import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken, TokenPayload } from '../utils/jwt';

// Base user type approximation
type PrismaUserBase = {
  id: number;
  email: string;
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  profileFile?: string | null;
  isAdmin?: boolean;
  resetToken?: string | null;
  resetTokenExpiry?: Date | string | null;
  isVerified?: boolean;
  emailVerifiedAt?: Date | string | null;
  otp?: number | null;
  otpVerified?: boolean;
  otpVerifiedAt?: Date | string | null;
  isActive?: boolean;
  lastLoginAt?: Date | string | null;
  roleId?: number;
  stateId?: number | null;
  typeId?: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface UserCreateInput extends Partial<PrismaUserBase> {
  email: string;
  password?: string;
  firstName?: string | null;
  lastName?: string | null;
  roleId: number;
  isActive?: boolean;
  isAdmin?: boolean;
  isVerified?: boolean;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  otp?: number | null;
  otpVerified?: boolean;
  otpVerifiedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  stateId?: number | null;
  typeId?: number | null;
  name?: string | null;
  profileFile?: string | null;
}

export interface UserUpdateInput extends Partial<UserCreateInput> {}

export class User {
  // Core Fields
  id: number; // Auto-incremented ID from database (set to 0 for new instances)
  email: string;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  profileFile: string | null;

  // Authentication
  isAdmin: boolean;
  resetToken: string | null;
  resetTokenExpiry: Date | null;

  // Verification
  isVerified: boolean;
  emailVerifiedAt: Date | null;
  otp: number | null;
  otpVerified: boolean;
  otpVerifiedAt: Date | null;

  // Status
  isActive: boolean;
  lastLoginAt: Date | null;

  // Metadata
  roleId: number;
  stateId: number | null;
  typeId: number | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  constructor(init?: Partial<User> | any) {
    // Initialize with default values
    this.id = init?.id ?? 0; // 0 indicates a new, unsaved user
    this.email = init?.email ?? '';
    this.password = init?.password ?? null;
    this.firstName = init?.firstName ?? null;
    this.lastName = init?.lastName ?? null;
    this.name = init?.name ?? null;
    this.profileFile = init?.profileFile ?? null;
    this.isAdmin = init?.isAdmin ?? false;
    this.resetToken = init?.resetToken ?? null;
    this.resetTokenExpiry = init?.resetTokenExpiry ? new Date(init.resetTokenExpiry) : null;
    this.isVerified = init?.isVerified ?? false;
    this.emailVerifiedAt = init?.emailVerifiedAt ? new Date(init.emailVerifiedAt) : null;
    this.otp = init?.otp ?? null;
    this.otpVerified = init?.otpVerified ?? false;
    this.otpVerifiedAt = init?.otpVerifiedAt ? new Date(init.otpVerifiedAt) : null;
    this.isActive = init?.isActive ?? true;
    this.lastLoginAt = init?.lastLoginAt ? new Date(init.lastLoginAt) : null;
    this.roleId = init?.roleId ?? 1;
    this.stateId = init?.stateId ?? null;
    this.typeId = init?.typeId ?? 0;
    this.createdAt = init?.createdAt ? new Date(init.createdAt) : new Date();
    this.updatedAt = init?.updatedAt ? new Date(init.updatedAt) : new Date();
  }

  // Helper methods
  get fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ') || '';
  }

  async setPassword(password: string): Promise<void> {
    this.password = await hashPassword(password);
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.password) return false;
    return comparePasswords(password, this.password);
  }

  generateAuthToken(): string {
    return generateToken(this);
  }

  toJSON(): Omit<User, 'password' | 'resetToken' | 'resetTokenExpiry' | 'otp'> {
    const { password, resetToken, resetTokenExpiry, otp, ...safeUser } = this;
    return safeUser as Omit<User, 'password' | 'resetToken' | 'resetTokenExpiry' | 'otp'>;
  }

  static fromPrisma(data: any): User {
    return new User({
      id: data.id,
      email: data.email || '',
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      name: data.name,
      profileFile: data.profileFile,
      isAdmin: data.isAdmin || false,
      resetToken: data.resetToken,
      resetTokenExpiry: data.resetTokenExpiry ? new Date(data.resetTokenExpiry) : null,
      isVerified: data.isVerified || false,
      emailVerifiedAt: data.emailVerifiedAt ? new Date(data.emailVerifiedAt) : null,
      otp: data.otp,
      otpVerified: data.otpVerified || false,
      otpVerifiedAt: data.otpVerifiedAt ? new Date(data.otpVerifiedAt) : null,
      lastLoginAt: data.lastLoginAt ? new Date(data.lastLoginAt) : null,
      stateId: data.stateId,
      typeId: data.typeId,
      roleId: data.roleId || 1,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    });
  }

  toSafeUser(token?: string): SafeUser {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      name: this.name,
      profileFile: this.profileFile,
      isAdmin: this.isAdmin,
      isVerified: this.isVerified,
      emailVerifiedAt: this.emailVerifiedAt,
      otpVerified: this.otpVerified,
      otpVerifiedAt: this.otpVerifiedAt,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
      roleId: this.roleId,
      stateId: this.stateId,
      typeId: this.typeId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      token,
    };
  }
}

// Type for user data that can be sent to the client
export interface SafeUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  profileFile: string | null;
  isAdmin: boolean;
  isVerified: boolean;
  emailVerifiedAt: Date | null;
  otpVerified: boolean;
  otpVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  roleId: number;
  stateId: number | null;
  typeId: number | null;
  createdAt: Date;
  updatedAt: Date;
  token?: string;
}
