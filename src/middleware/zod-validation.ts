import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ApiResponse } from '../resources/ApiResponse';

// Generic Zod validation middleware
export const validateZod = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request body
      const validatedData = schema.parse(req.body);

      // Replace req.body with validated and sanitized data
      req.body = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join('.') || 'field';
        const message = firstIssue?.message || 'Validation error';

        return res.status(422).json(ApiResponse.validationErrorSimple(field, message));
      }

      // Handle other errors
      return res.status(500).json(ApiResponse.error('Internal server error during validation'));
    }
  };
};

// Validation middleware for query parameters
export const validateZodQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.query);
      req.query = validatedData as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join('.') || 'field';
        const message = firstIssue?.message || 'Query validation error';

        return res
          .status(422)
          .json(ApiResponse.validationErrorSimple(field, message, `${field}: ${message}`));
      }

      return res
        .status(500)
        .json(ApiResponse.error('Internal server error during query validation'));
    }
  };
};

// Validation middleware for URL parameters
export const validateZodParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.params);
      req.params = validatedData as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join('.') || 'param';
        const message = firstIssue?.message || 'Parameter validation error';

        return res
          .status(422)
          .json(ApiResponse.validationErrorSimple(field, message, `${field}: ${message}`));
      }

      return res
        .status(500)
        .json(ApiResponse.error('Internal server error during parameter validation'));
    }
  };
};

// Combined validation middleware for body, query, and params
export const validateZodAll = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path?.join('.') || 'field';
        const message = firstIssue?.message || 'Validation error';

        return res.status(422).json(ApiResponse.validationErrorSimple(field, message));
      }

      return res.status(500).json(ApiResponse.error('Internal server error during validation'));
    }
  };
};
