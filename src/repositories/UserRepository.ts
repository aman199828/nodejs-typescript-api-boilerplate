import type { PrismaClient, User } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class UserRepository extends BaseRepository<User> {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: number): Promise<User | null> {
    return await (this.prisma as any).user.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<User[]> {
    return await (this.prisma as any).user.findMany();
  }

  async create(data: any): Promise<User> {
    return await (this.prisma as any).user.create({
      data,
    });
  }

  async update(id: number, data: any): Promise<User | null> {
    try {
      return await (this.prisma as any).user.update({
        where: { id },
        data,
      });
    } catch (error) {
      return null;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      await (this.prisma as any).user.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async findMany(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }): Promise<{ data: User[]; total: number }> {
    const { skip = 0, take = 10, where = {}, orderBy = { createdAt: 'desc' } } = options || {};

    const [data, total] = await Promise.all([
      (this.prisma as any).user.findMany({
        skip,
        take,
        where,
        orderBy,
      }),
      (this.prisma as any).user.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return await (this.prisma as any).user.findUnique({
      where: { email },
    });
  }

  /**
   * Find admin users
   */
  async findAdmins(): Promise<User[]> {
    return await (this.prisma as any).user.findMany({
      where: { isAdmin: true },
    });
  }

  /**
   * Find user by email and verify admin status
   */
  async findAdminByEmail(email: string): Promise<User | null> {
    return await (this.prisma as any).user.findFirst({
      where: {
        email,
        isAdmin: true,
        isActive: true,
      },
    });
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(id: number): Promise<User | null> {
    return await (this.prisma as any).user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Update user password
   */
  async updatePassword(id: number, hashedPassword: string): Promise<User | null> {
    return await (this.prisma as any).user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  /**
   * Find user by reset token
   */
  async findByResetToken(token: string): Promise<User | null> {
    return await (this.prisma as any).user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });
  }

  /**
   * List users with pagination and filters
   */
  async list(
    filters: Partial<User>,
    page: number,
    limit: number
  ): Promise<{ data: User[]; total: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      (this.prisma as any).user.findMany({
        skip,
        take: limit,
        where: filters,
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).user.count({ where: filters }),
    ]);

    return { data, total };
  }
}
