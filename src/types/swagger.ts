import { OpenAPIV3 } from 'openapi-types';

export type SwaggerSchema = {
  paths: OpenAPIV3.PathsObject;
  components?: OpenAPIV3.ComponentsObject;
  tags?: OpenAPIV3.TagObject[];
};

export type SwaggerParameter = OpenAPIV3.ParameterObject;
export type SwaggerResponse = OpenAPIV3.ResponseObject;
export type SwaggerSchemaObject = OpenAPIV3.SchemaObject;
export type SwaggerRequestBody = OpenAPIV3.RequestBodyObject;

// Common response schemas
export const commonResponses = {
  BadRequest: {
    description: 'Bad Request - The request was invalid or cannot be served',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error',
        },
      },
    },
  },
  Unauthorized: {
    description: 'Unauthorized - Authentication is required',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error',
        },
      },
    },
  },
  Forbidden: {
    description: 'Forbidden - Not enough permissions',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error',
        },
      },
    },
  },
  NotFound: {
    description: 'Not Found - The requested resource was not found',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error',
        },
      },
    },
  },
  ServerError: {
    description: 'Server Error - Something went wrong on the server',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error',
        },
      },
    },
  },
} as const;
