import { Pagination } from './Pagination';

export interface SortOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterOptions {
  search?: string;
  searchFields?: string[];
  exactFilters?: Record<string, any>;
  rangeFilters?: Record<string, { min?: any; max?: any }>;
}

export class PaginatedQueryBuilder {
  /**
   * Build Prisma query with pagination
   */
  static buildPrismaQuery(pagination: Pagination, filters?: FilterOptions, sort?: SortOptions) {
    const query: any = {
      ...pagination.getPrismaOptions(),
    };

    // Add where clause if filters provided
    if (filters) {
      query.where = this.buildWhereClause(filters);
    }

    // Add orderBy clause if sort provided
    if (sort) {
      query.orderBy = this.buildOrderByClause(sort);
    } else {
      // Default sorting
      query.orderBy = { createdAt: 'desc' };
    }

    return query;
  }

  /**
   * Build where clause for Prisma
   */
  private static buildWhereClause(filters: FilterOptions) {
    const where: any = {};

    // Search functionality
    if (filters.search && filters.searchFields && filters.searchFields.length > 0) {
      where.OR = filters.searchFields.map(field => ({
        [field]: {
          contains: filters.search,
          mode: 'insensitive',
        },
      }));
    }

    // Exact filters
    if (filters.exactFilters) {
      Object.assign(where, filters.exactFilters);
    }

    // Range filters
    if (filters.rangeFilters) {
      Object.entries(filters.rangeFilters).forEach(([field, range]) => {
        if (range.min !== undefined || range.max !== undefined) {
          where[field] = {};
          if (range.min !== undefined) {
            where[field].gte = range.min;
          }
          if (range.max !== undefined) {
            where[field].lte = range.max;
          }
        }
      });
    }

    return where;
  }

  /**
   * Build orderBy clause for Prisma
   */
  private static buildOrderByClause(sort: SortOptions) {
    const sortBy = sort.sortBy || 'createdAt';
    const sortOrder = sort.sortOrder || 'desc';

    return {
      [sortBy]: sortOrder,
    };
  }

  /**
   * Build count query for Prisma
   */
  static buildCountQuery(filters?: FilterOptions) {
    if (!filters) {
      return {};
    }

    return {
      where: this.buildWhereClause(filters),
    };
  }

  /**
   * Parse query parameters for common filters
   */
  static parseQueryParams(query: any, searchFields: string[] = []) {
    const filters: FilterOptions = {};
    const sort: SortOptions = {};

    // Search
    if (query.search) {
      filters.search = query.search;
      filters.searchFields = searchFields;
    }

    // Sorting
    if (query.sortBy) {
      sort.sortBy = query.sortBy;
    }
    if (query.sortOrder && ['asc', 'desc'].includes(query.sortOrder)) {
      sort.sortOrder = query.sortOrder as 'asc' | 'desc';
    }

    return { filters, sort };
  }
}
