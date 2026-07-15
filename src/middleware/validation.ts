import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, Result, ValidationError } from 'express-validator';
import { ApiResponse } from '../resources/ApiResponse';

type ErrorFormatter = (error: ValidationError) => { field: string; message: string };

// Custom error formatter
const errorFormatter: ErrorFormatter = error => ({
  field: error.type === 'field' ? error.path : error.type,
  message: error.msg,
});

// Validation error handler
export const validationErrorHandler = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult.withDefaults({
    formatter: errorFormatter,
  });

  const result = errors(req);

  if (!result.isEmpty()) {
    const validationErrors = result.array();
    const firstError = validationErrors[0];
    const field = firstError.field || 'field';
    const message = firstError.message || 'Validation error';

    return res.status(422).json(ApiResponse.validationErrorSimple(field, message));
  }

  next();
};

// Validation middleware wrapper
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult.withDefaults({
      formatter: errorFormatter,
    });

    const result = errors(req);

    if (result.isEmpty()) {
      return next();
    }

    const validationErrors = result.array();
    const firstError = validationErrors[0];
    const field = firstError.field || 'field';
    const message = firstError.message || 'Validation error';

    return res.status(422).json(ApiResponse.validationErrorSimple(field, message));
  };
};
