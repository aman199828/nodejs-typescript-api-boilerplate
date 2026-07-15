export interface ApiResponseData {
  success?: boolean;
  message: string;
  data?: any;
  errors?: any;
  meta?: any;
  validationErrors?: any;
  field?: string;
}

export class ApiResponse {
  /**
   * Return a success JSON response with optional data and message
   */
  static success(
    data: any = null,
    message: string = 'Success',
    status: number = 200,
    meta?: any
  ): ApiResponseData {
    const response: ApiResponseData = {
      success: true,
      message,
    };

    if (data !== null) {
      response.data = data;
    }

    if (meta) {
      response.meta = meta;
    }

    return response;
  }

  /**
   * Return an error JSON response with localized message
   */
  static error(
    message: string,
    status: number = 400,
    errors: any = null,
    meta?: any
  ): ApiResponseData {
    const response: ApiResponseData = {
      success: false,
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    if (meta) {
      response.meta = meta;
    }

    return response;
  }

  /**
   * Return a validation error response
   */
  static validationError(errors: any, message?: string): ApiResponseData {
    if (Array.isArray(errors)) {
      // Handle express-validator errors array
      const fieldErrors: { [key: string]: string[] } = {};
      const generalErrors: string[] = [];

      errors.forEach((error: any) => {
        const field = error.path || error.param || error.field || 'general';
        const errorMessage = error.msg || error.message || 'Invalid value';

        if (field && field !== 'general') {
          if (!fieldErrors[field]) {
            fieldErrors[field] = [];
          }
          fieldErrors[field].push(errorMessage);
        } else {
          generalErrors.push(errorMessage);
        }
      });

      // Create detailed error message
      let errorMessage = message || 'Validation failed';
      if (Object.keys(fieldErrors).length > 0) {
        const fieldMessages = Object.entries(fieldErrors)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join('; ');
        errorMessage = message || `Validation failed - ${fieldMessages}`;
      } else if (generalErrors.length > 0) {
        errorMessage = message || `Validation failed - ${generalErrors.join(', ')}`;
      }

      return {
        success: false,
        message: errorMessage,
        errors: {
          fieldErrors,
          generalErrors: generalErrors.length > 0 ? generalErrors : undefined,
        },
        validationErrors: errors.map((err: any) => ({
          field: err.path || err.param || err.field,
          message: err.msg || err.message,
          value: err.value,
        })),
      };
    }

    // Fallback for non-array errors
    const errorMessage = message || `Validation error: ${errors?.message || 'Invalid input'}`;
    return {
      success: false,
      message: errorMessage,
      errors: errors,
    };
  }

  /**
   * Return a simplified validation error response (one error at a time)
   */
  static validationErrorSimple(
    field: string,
    message: string,
    customMessage?: string
  ): ApiResponseData {
    const errorMessage = customMessage || `${message}`;

    return {
      success: false,
      message: errorMessage,
      field: field,
    };
  }

  /**
   * Return a not found error response
   */
  static notFound(message: string = 'Not found.'): ApiResponseData {
    return this.error(message, 404);
  }

  /**
   * Return an unauthorized error response
   */
  static unauthorized(message: string = 'Unauthorized.'): ApiResponseData {
    return this.error(message, 401);
  }

  /**
   * Return a forbidden error response
   */
  static forbidden(message: string = 'Forbidden.'): ApiResponseData {
    return this.error(message, 403);
  }

  /**
   * Return a server error response
   */
  static serverError(message: string = 'Internal server error.'): ApiResponseData {
    return this.error(message, 500);
  }
}
