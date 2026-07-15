import type { PrismaClient, AuthToken } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class AuthTokenRepository extends BaseRepository<AuthToken> {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: number): Promise<AuthToken | null> {
    return await (this.prisma as any).authToken.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<AuthToken[]> {
    return await (this.prisma as any).authToken.findMany();
  }

  async create(data: any): Promise<AuthToken> {
    return await (this.prisma as any).authToken.create({
      data,
    });
  }

  async update(id: number, data: any): Promise<AuthToken | null> {
    try {
      return await (this.prisma as any).authToken.update({
        where: { id },
        data,
      });
    } catch (error) {
      return null;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      await (this.prisma as any).authToken.delete({
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
  }): Promise<{ data: AuthToken[]; total: number }> {
    const { skip = 0, take = 10, where = {}, orderBy = { createdAt: 'desc' } } = options || {};

    const [data, total] = await Promise.all([
      (this.prisma as any).authToken.findMany({
        skip,
        take,
        where,
        orderBy,
      }),
      (this.prisma as any).authToken.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find token by hash
   */
  async findByTokenHash(tokenHash: string): Promise<AuthToken | null> {
    return await (this.prisma as any).authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  /**
   * Find active tokens for a user
   */
  async findActiveTokensByUserId(userId: number): Promise<AuthToken[]> {
    return await (this.prisma as any).authToken.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  /**
   * Delete all tokens for a user
   */
  async deleteAllUserTokens(userId: number): Promise<boolean> {
    try {
      await (this.prisma as any).authToken.deleteMany({
        where: { userId },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete expired tokens
   */
  async deleteExpiredTokens(): Promise<number> {
    const result = await (this.prisma as any).authToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  }

  /**
   * Create a new auth token
   */
  async createToken(userId: number, tokenHash: string, expiresAt: Date): Promise<AuthToken> {
    return await (this.prisma as any).authToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }
}
