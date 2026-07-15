import { User, UserCreateInput, UserUpdateInput, SafeUser } from '../models/User';
import { UserRepository } from '../repositories/UserRepository';
import bcrypt from 'bcrypt';

export class UserService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  // Create a new user
  async create(data: UserCreateInput): Promise<User> {
    const user = await this.userRepository.create(data);
    return User.fromPrisma(user);
  }

  // Find a user by ID
  async findById(id: number): Promise<User | null> {
    const user = await this.userRepository.findById(id);
    return user ? User.fromPrisma(user) : null;
  }

  // Find a user by email
  async findByEmail(email: string): Promise<User | null> {
    const userData = await this.userRepository.findByEmail(email);
    return userData ? User.fromPrisma(userData) : null;
  }

  // Verify reset token
  async verifyResetToken(token: string): Promise<User | null> {
    const userData = await this.userRepository.findByResetToken(token);
    return userData ? User.fromPrisma(userData) : null;
  }

  // Register a new user
  async register(userData: UserCreateInput): Promise<{ user: SafeUser; token: string }> {
    // Check if user already exists
    const existingUser = await this.findByEmail(userData.email || '');
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const user = User.fromPrisma({
      ...userData,
      isActive: true,
      isVerified: false,
    });

    // Hash password if provided
    if (userData.password) {
      await user.setPassword(userData.password);
    }

    // Save user to database
    const createdUser = await this.userRepository.create(user);
    const newUser = User.fromPrisma(createdUser);

    // Generate token
    const token = newUser.generateAuthToken();

    return {
      user: newUser.toSafeUser(token),
      token,
    };
  }

  // Login a user
  async login(email: string, password: string): Promise<{ user: SafeUser; token: string }> {
    const userData = await this.userRepository.findByEmail(email);
    if (!userData) {
      throw new Error('Invalid email or password');
    }

    const user = User.fromPrisma(userData);

    if (!user.password) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active (both isActive and stateId checks)
    if (!user.isActive) {
      throw new Error('Account is deactivated. Please contact support.');
    }

    // Check user state - only allow active users to login
    if (user.stateId !== null && user.stateId !== 1) {
      // 1 = ACTIVE state
      let statusMessage = 'Account is not active. Please contact support.';

      switch (user.stateId) {
        case 0: // INACTIVE
          statusMessage = 'Account is inactive. Please contact support.';
          break;
        case 3: // PENDING
          statusMessage = 'Account is pending approval. Please wait for admin approval.';
          break;
        case 4: // DELETED
          statusMessage = 'Account has been deleted. Please contact support.';
          break;
        case 5: // REJECTED
          statusMessage = 'Account has been rejected. Please contact support.';
          break;
        case 6: // BLOCKED
          statusMessage = 'Account has been blocked. Please contact support.';
          break;
        default:
          statusMessage = 'Account status is invalid. Please contact support.';
      }

      throw new Error(statusMessage);
    }

    const token = user.generateAuthToken();
    user.lastLoginAt = new Date();
    await this.userRepository.update(user.id, { lastLoginAt: user.lastLoginAt });

    return {
      user: user.toSafeUser(token),
      token,
    };
  }

  // Update a user
  async update(id: number, data: UserUpdateInput): Promise<User | null> {
    const user = await this.userRepository.update(id, data);
    return user ? new User(user) : null;
  }

  // Delete a user
  async delete(id: number): Promise<boolean> {
    return this.userRepository.delete(id);
  }

  // List all users with pagination
  async list(
    page: number = 1,
    limit: number = 10,
    filters: Partial<User> = {}
  ): Promise<{ users: User[]; total: number }> {
    const { data: users, total } = await this.userRepository.list(filters, page, limit);

    return {
      users: users.map(user => User.fromPrisma(user)),
      total,
    };
  }

  // Convert User to SafeUser (removes sensitive data)
  toSafeUser(user: User): SafeUser {
    const { password, otp, otpVerifiedAt, ...safeUser } = user as any;
    return {
      ...safeUser,
      fullName: user.fullName,
    };
  }
}
