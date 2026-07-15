import swaggerJsdoc from 'swagger-jsdoc';
import { adminSwagger } from './swagger/admin.swagger';
import { adminAuthSwagger } from './swagger/admin-auth.swagger';

// Using a hardcoded version since we can't import package.json directly
const API_VERSION = '1.0.0';

// Base OpenAPI configuration
const baseOpenAPIConfig = {
  openapi: '3.0.0',
  info: {
    title: 'Create HQ API',
    version: API_VERSION,
    description: 'API documentation for Create HQ application',
    contact: {
      name: 'API Support',
      email: 'support@test.com',
    },
  },
  servers: [
    {
      url: '/backend/api/v1',
      description: 'API V1 (Backend)',
    },
    {
      url: '/api/v1',
      description: 'API V1 (Direct)',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      // Error schema
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Error message describing the issue' },
          error: {
            type: 'string',
            nullable: true,
            example: 'Detailed error message in development',
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
            nullable: true,
          },
          statusCode: { type: 'integer', example: 400 },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
        },
      },
      // User related schemas
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          firstName: { type: 'string', example: 'John' },
          lastName: { type: 'string', example: 'Doe' },
          name: { type: 'string', example: 'John Doe' },
          roleId: { type: 'integer', example: 1 },
          isVerified: { type: 'boolean', example: true },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time', example: '2023-01-01T00:00:00Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2023-01-01T00:00:00Z' },
          lastLoginAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            example: '2023-01-01T00:00:00Z',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          password: { type: 'string', format: 'password', example: 'password123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            },
          },
        },
      },
      // Error related schemas
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Error message' },
          error: { type: 'string', example: 'Error details', nullable: true },
          statusCode: { type: 'integer', example: 400 },
          timestamp: { type: 'string', format: 'date-time', example: '2023-01-01T00:00:00Z' },
          path: { type: 'string', example: '/api/v1/admin/login' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'Invalid email format' },
              },
            },
            example: [
              { field: 'email', message: 'Invalid email format' },
              { field: 'password', message: 'Password is required' },
            ],
          },
          statusCode: { type: 'integer', example: 400 },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
        },
      },
      // Story related schemas
      Story: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          caption: { type: 'string', nullable: true, example: 'Check out my new story!' },
          mediaUrl: { type: 'string', example: 'https://example.com/stories/media.jpg' },
          mediaType: { type: 'string', enum: ['image', 'video'], example: 'image' },
          sound: {
            type: 'object',
            nullable: true,
            properties: {
              audioUrl: { type: 'string', example: 'https://example.com/stories/audio.mp3' },
              audioDuration: { type: 'integer', example: 30, description: 'Duration in seconds' },
            },
          },
          thumbnail: {
            type: 'string',
            nullable: true,
            example: 'https://example.com/stories/thumb.jpg',
          },
          duration: {
            type: 'integer',
            nullable: true,
            example: 60,
            description: 'Video duration in seconds',
          },
          visibility: { type: 'string', enum: ['public', 'subscribers'], example: 'public' },
          viewCount: { type: 'integer', example: 15 },
          isViewed: { type: 'boolean', example: false },
          remainingTime: {
            type: 'integer',
            example: 86400,
            description: 'Seconds until expiration',
          },
          createdAt: { type: 'string', format: 'date-time', example: '2023-01-01T00:00:00Z' },
          expiresAt: { type: 'string', format: 'date-time', example: '2023-01-02T00:00:00Z' },
          user: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'integer', example: 1 },
              name: { type: 'string', example: 'John Doe' },
              userName: { type: 'string', example: 'johndoe' },
              profileFile: {
                type: 'string',
                nullable: true,
                example: 'https://example.com/profile.jpg',
              },
              profession: { type: 'string', nullable: true, example: 'Photographer' },
            },
          },
        },
      },
    },
    responses: {
      // Error Responses
      BadRequest: {
        description: 'Bad Request - The request was invalid or cannot be served',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
            example: {
              success: false,
              message: 'Validation error',
              error: 'Email is required and must be valid',
            },
          },
        },
      },
      Unauthorized: {
        description: 'Unauthorized - Authentication is required or has failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
            example: {
              success: false,
              message: 'Authentication failed',
              error: 'Invalid email or password',
            },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden - Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
            example: {
              success: false,
              message: 'Insufficient permissions',
              error: 'Forbidden',
            },
          },
        },
      },
      NotFound: {
        description: 'Not Found - Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
            example: {
              success: false,
              message: 'Resource not found',
              error: 'Not Found',
            },
          },
        },
      },
      ServerError: {
        description: 'Server Error - Something went wrong on the server',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
            example: {
              success: false,
              message: 'Internal server error',
              error: 'Database connection failed',
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation Error - Request validation failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ValidationError',
            },
            example: {
              success: false,
              message: 'Validation failed',
              errors: [
                { field: 'email', message: 'Invalid email format' },
                { field: 'password', message: 'Password is required' },
              ],
            },
          },
        },
      },
    },
  },
};

// Main API documentation
export const mainSwaggerOptions: swaggerJsdoc.Options = {
  ...baseOpenAPIConfig,
  definition: {
    ...baseOpenAPIConfig,
    tags: [
      {
        name: 'Auth',
        description: 'Authentication endpoints',
      },
      {
        name: 'Users',
        description: 'User management endpoints',
      },
    ],
  },
};

// Paths to the API docs
const apiDocsPaths = ['./src/routes/**/*.ts', './src/controllers/**/*.ts'];

// Generate Swagger specs
const generatedSpec = swaggerJsdoc({
  ...mainSwaggerOptions,
  apis: apiDocsPaths,
}) as any;

// Merge base components into generated spec to ensure all $ref references resolve
export const swaggerSpec = {
  ...generatedSpec,
  components: {
    ...baseOpenAPIConfig.components,
    ...(generatedSpec.components || {}),
  },
};

// Admin API documentation
export const adminSwaggerSpec = {
  ...baseOpenAPIConfig,
  paths: {
    ...adminSwagger.paths,
    ...adminAuthSwagger.paths,
  },
  components: {
    ...baseOpenAPIConfig.components,
    ...(adminSwagger.components || {}),
  },
};
