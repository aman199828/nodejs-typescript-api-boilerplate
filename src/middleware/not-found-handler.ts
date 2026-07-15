import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from './error-handler';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new NotFoundError(`Route not found: ${req.originalUrl}`);
  next(error);
};
