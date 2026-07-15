import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../resources/ApiResponse';

export interface PaginationRequest extends Request {
  pagination?: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
}

/**
 * Validate pagination query parameters
 */
export const validatePagination = (req: PaginationRequest, res: Response, next: NextFunction) => {
  const errors: string[] = [];

  // Parse and validate page
  let page = 1;
  if (req.query.page) {
    const parsedPage = parseInt(req.query.page as string);
    if (isNaN(parsedPage) || parsedPage < 1) {
      errors.push('Page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  // Parse and validate limit
  let limit = 10;
  if (req.query.limit) {
    const parsedLimit = parseInt(req.query.limit as string);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push('Limit must be between 1 and 100');
    } else {
      limit = parsedLimit;
    }
  }

  // Validate sortBy (optional)
  const sortBy = req.query.sortBy as string;
  if (sortBy && typeof sortBy !== 'string') {
    errors.push('SortBy must be a string');
  }

  // Validate sortOrder (optional)
  const sortOrder = req.query.sortOrder as string;
  if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
    errors.push('SortOrder must be either "asc" or "desc"');
  }

  // Validate search (optional)
  const search = req.query.search as string;
  if (search && typeof search !== 'string') {
    errors.push('Search must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json(ApiResponse.error(errors.join(', ')));
  }

  // Attach parsed pagination data to request
  req.pagination = {
    page,
    limit,
    search,
    sortBy,
    sortOrder: sortOrder as 'asc' | 'desc',
  };

  next();
};

/**
 * Middleware to set default pagination if not provided
 */
export const setDefaultPagination = (defaultLimit: number = 10) => {
  return (req: PaginationRequest, res: Response, next: NextFunction) => {
    if (!req.query.page && !req.query.limit) {
      req.pagination = {
        page: 1,
        limit: defaultLimit,
      };
    }
    next();
  };
};
