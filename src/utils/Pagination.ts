import { PaginationMeta, PaginationQuery, PaginationOptions } from '../types/pagination';

export class Pagination {
  public readonly page: number;
  public readonly limit: number;
  public readonly total: number;
  public readonly totalPages: number;
  public readonly hasNext: boolean;
  public readonly hasPrev: boolean;
  public readonly offset: number;
  public readonly nextPage?: number;
  public readonly prevPage?: number;

  constructor(
    page: number = 1,
    limit: number = 10,
    total: number = 0,
    options: PaginationOptions = {}
  ) {
    const { maxLimit = 100, defaultLimit = 10, defaultPage = 1 } = options;

    // Validate and set page
    this.page = Math.max(1, Math.floor(page) || defaultPage);

    // Validate and set limit (max 100 items per page)
    this.limit = Math.min(Math.max(1, Math.floor(limit) || defaultLimit), maxLimit);

    // Set total (must be non-negative)
    this.total = Math.max(0, Math.floor(total) || 0);

    // Calculate derived properties
    this.totalPages = Math.ceil(this.total / this.limit);
    this.offset = (this.page - 1) * this.limit;
    this.hasNext = this.page < this.totalPages;
    this.hasPrev = this.page > 1;
    this.nextPage = this.hasNext ? this.page + 1 : undefined;
    this.prevPage = this.hasPrev ? this.page - 1 : undefined;
  }

  /**
   * Get pagination metadata
   */
  getMeta(): PaginationMeta {
    return {
      page: this.page,
      limit: this.limit,
      total: this.total,
      totalPages: this.totalPages,
      hasNext: this.hasNext,
      hasPrev: this.hasPrev,
      nextPage: this.nextPage,
      prevPage: this.prevPage,
    };
  }

  /**
   * Create Pagination instance from query parameters
   */
  static fromQuery(query: PaginationQuery, options?: PaginationOptions): Pagination {
    const page = typeof query.page === 'string' ? parseInt(query.page) : query.page;
    const limit = typeof query.limit === 'string' ? parseInt(query.limit) : query.limit;

    return new Pagination(page, limit, 0, options);
  }

  /**
   * Create Pagination instance with total count
   */
  static create(
    page: number,
    limit: number,
    total: number,
    options?: PaginationOptions
  ): Pagination {
    return new Pagination(page, limit, total, options);
  }

  /**
   * Validate pagination parameters
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.page < 1) {
      errors.push('Page must be a positive integer');
    }

    if (this.limit < 1) {
      errors.push('Limit must be at least 1');
    }

    if (this.total < 0) {
      errors.push('Total count cannot be negative');
    }

    if (this.page > this.totalPages && this.total > 0) {
      errors.push(`Page ${this.page} exceeds total pages ${this.totalPages}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get Prisma-compatible query options
   */
  getPrismaOptions() {
    return {
      skip: this.offset,
      take: this.limit,
    };
  }

  /**
   * Get SQL-compatible LIMIT and OFFSET
   */
  getSqlOptions() {
    return {
      limit: this.limit,
      offset: this.offset,
    };
  }
}
