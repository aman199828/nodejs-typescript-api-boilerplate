import dotenv from 'dotenv';

dotenv.config();

export default {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database Configuration
  DB_URI: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/create_hq',

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',

  // API Configuration
  API_PREFIX: '/api/v1',

  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',

  // SMTP Configuration
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.example.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USERNAME: process.env.SMTP_USERNAME || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',

  // Email Configuration
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'Create HQ',

  // Frontend URL for password reset links
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Application URL for file downloads and API responses
  APP_URL: process.env.APP_URL || 'http://localhost:3000',

  // Admin Configuration
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@example.com',

  // Token Expiration (in seconds)
  PASSWORD_RESET_TOKEN_EXPIRY: 3600, // 1 hour

  // Order Configuration
  ORDER: {
    PLATFORM_FEE_PERCENTAGE: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10'), // Platform fee percentage (default 10%)
    DEFAULT_SHIPPING_COST: parseFloat(process.env.DEFAULT_SHIPPING_COST || '5.00'), // Default shipping cost (mock for now)
    TAX_PERCENTAGE: parseFloat(process.env.TAX_PERCENTAGE || '0'), // Tax percentage (default 0%, can be calculated based on location)
  },

  // AWS S3 Configuration
  AWS: {
    REGION: process.env.AWS_REGION || 'us-east-1',
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
    S3_BUCKET: process.env.AWS_S3_BUCKET || '',
    S3_ACL: process.env.AWS_S3_ACL || 'private',
    S3_SSE: process.env.AWS_S3_SSE || 'AES256', // Server-Side Encryption: 'AES256' or 'aws:kms'
    KMS_KEY_ID: process.env.AWS_KMS_KEY_ID || '', // Required if S3_SSE is 'aws:kms'
    USE_IAM_ROLE: process.env.AWS_USE_IAM_ROLE === 'true', // Use IAM role instead of access keys (for EC2/ECS)
    CDN_URL: process.env.CDN_URL || '',
    ENABLE_CDN: process.env.AWS_S3_ENABLE_CDN === 'true',
    CDN_KEY_PAIR_ID: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID || '', // CloudFront key pair ID for signed URLs
    CDN_PRIVATE_KEY: process.env.AWS_CLOUDFRONT_PRIVATE_KEY || '', // CloudFront private key (base64 or PEM)
    CDN_SIGNED_URL_EXPIRY: process.env.AWS_CLOUDFRONT_SIGNED_URL_EXPIRY || '3600', // Signed URL expiry in seconds
  },

  // Firebase Configuration
  FIREBASE: {
    SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    SERVICE_ACCOUNT_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  },
};
