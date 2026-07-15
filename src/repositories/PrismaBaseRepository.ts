import type { PrismaClient } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export abstract class PrismaBaseRepository<T> extends BaseRepository<T> {
  protected prisma: PrismaClient;
  protected model: keyof PrismaClient;

  constructor(prisma: PrismaClient, model: keyof PrismaClient) {
    super(prisma);
    this.prisma = prisma;
    this.model = model;
  }

  async create(data: Partial<T>): Promise<T> {
    return (this.prisma[this.model] as any).create({ data });
  }

  async findById(id: number): Promise<T | null> {
    return (this.prisma[this.model] as any).findUnique({
      where: { id },
    });
  }

  async update(id: number, data: Partial<T>): Promise<T | null> {
    return (this.prisma[this.model] as any).update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<boolean> {
    try {
      await (this.prisma[this.model] as any).delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async list(
    filters: Partial<T> = {},
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: T[]; total: number }> {
    const skip = (page - 1) * limit;
    const where = this.buildWhereClause(filters);

    const [data, total] = await Promise.all([
      (this.prisma[this.model] as any).findMany({
        where,
        skip,
        take: limit,
      }),
      (this.prisma[this.model] as any).count({ where }),
    ]);

    return { data, total };
  }

  async findAll(): Promise<T[]> {
    return (this.prisma[this.model] as any).findMany();
  }

  async findMany(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }): Promise<{ data: T[]; total: number }> {
    const { skip = 0, take = 10, where = {}, orderBy = { createdAt: 'desc' } } = options || {};

    const [data, total] = await Promise.all([
      (this.prisma[this.model] as any).findMany({
        skip,
        take,
        where,
        orderBy,
      }),
      (this.prisma[this.model] as any).count({ where }),
    ]);

    return { data, total };
  }

  protected abstract buildWhereClause(filters: Partial<T>): any;
}
