export const adminAuthSwagger = {
  paths: {
    '/admin/login': {
      post: {
        tags: ['Admin Authentication'],
        summary: 'Admin Login',
        description: 'Authenticate admin user and return JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'admin@example.com',
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    example: 'password123',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Login successful' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          $ref: '#/components/schemas/User',
                        },
                        token: {
                          type: 'string',
                          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                        expiresAt: {
                          type: 'string',
                          format: 'date-time',
                          example: '2023-12-31T23:59:59Z',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Invalid credentials' },
                  },
                },
              },
            },
          },
          '422': {
            description: 'Validation Error',
            content: {
              'application/json': {
                schema: {
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
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Internal server error' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/logout': {
      post: {
        tags: ['Admin Authentication'],
        summary: 'Admin Logout',
        description: 'Logout admin user and invalidate token',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Logout successful' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'No authentication token provided' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Internal server error' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/profile': {
      get: {
        tags: ['Admin Authentication'],
        summary: 'Get Admin Profile',
        description: 'Get current admin user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Profile retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Profile retrieved successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          $ref: '#/components/schemas/User',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'No authentication token provided' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Not Found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Admin user not found' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Internal server error' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/update-profile': {
      put: {
        tags: ['Admin Authentication'],
        summary: 'Update Admin Profile',
        description: 'Update admin user profile with optional image upload',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  firstName: {
                    type: 'string',
                    example: 'John',
                  },
                  lastName: {
                    type: 'string',
                    example: 'Doe',
                  },
                  name: {
                    type: 'string',
                    example: 'John Doe',
                  },
                  profileFile: {
                    type: 'string',
                    format: 'binary',
                    description: 'Profile image file',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Profile updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Profile updated successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          $ref: '#/components/schemas/User',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Failed to update profile' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'No authentication token provided' },
                  },
                },
              },
            },
          },
          '422': {
            description: 'Validation Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Validation failed' },
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          field: { type: 'string', example: 'firstName' },
                          message: { type: 'string', example: 'First name must be a string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Internal server error' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/update-password': {
      put: {
        tags: ['Admin Authentication'],
        summary: 'Update Admin Password',
        description: 'Update admin user password',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword', 'confirmPassword'],
                properties: {
                  currentPassword: {
                    type: 'string',
                    format: 'password',
                    example: 'currentPassword123',
                  },
                  newPassword: {
                    type: 'string',
                    format: 'password',
                    example: 'newPassword123',
                    minLength: 8,
                  },
                  confirmPassword: {
                    type: 'string',
                    format: 'password',
                    example: 'newPassword123',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Password updated successfully' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Current password is incorrect' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'No authentication token provided' },
                  },
                },
              },
            },
          },
          '422': {
            description: 'Validation Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Validation failed' },
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          field: { type: 'string', example: 'newPassword' },
                          message: {
                            type: 'string',
                            example: 'Password must be at least 8 characters long',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Internal server error' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          firstName: { type: 'string', example: 'John' },
          lastName: { type: 'string', example: 'Doe' },
          name: { type: 'string', example: 'John Doe' },
          profileFile: { type: 'string', nullable: true, example: 'profile-1234567890.jpg' },
          isAdmin: { type: 'boolean', example: true },
          isVerified: { type: 'boolean', example: true },
          isActive: { type: 'boolean', example: true },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
