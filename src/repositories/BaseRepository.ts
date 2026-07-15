import type { PrismaClient } from '@prisma/client';

export abstract class BaseRepository<T> {
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Find a record by ID
   */
  abstract findById(id: number): Promise<T | null>;

  /**
   * Find all records
   */
  abstract findAll(): Promise<T[]>;

  /**
   * Create a new record
   */
  abstract create(data: any): Promise<T>;

  /**
   * Update a record by ID
   */
  abstract update(id: number, data: any): Promise<T | null>;

  /**
   * Delete a record by ID
   */
  abstract delete(id: number): Promise<boolean>;

  /**
   * Find records with pagination
   */
  abstract findMany(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }): Promise<{ data: T[]; total: number }>;
}
