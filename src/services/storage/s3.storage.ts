import { Express } from 'express';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { createReadStream } from 'fs';
import { StorageProvider, UploadOptions, UploadResult } from './storage.interface';
import { createLogger } from '../../utils/logger';

let config: any;
try {
  config = require('../../config/config').default;
} catch {
  config = null; // Config file doesn't exist - use env vars only
}

/**
 * AWS S3 Storage Provider
 *
 * To use this provider:
 * 1. Install: npm install @aws-sdk/client-s3
 * 2. Configure AWS credentials in .env
 * 3. Set STORAGE_PROVIDER=s3 in .env
 */
export class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client;
  private bucket: string;
  private region: string;
  private acl: string;
  private cdnUrl: string;
  private enableCdn: boolean;
  private cdnKeyPairId?: string;
  private cdnPrivateKey?: string;
  private cdnSignedUrlExpiry: number;
  private sseAlgorithm: string;
  private kmsKeyId?: string;
  private logger: ReturnType<typeof createLogger>;
  private readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB - use multipart for larger files

  constructor() {
    // Get configuration - try config first, then env vars, then defaults
    this.bucket = config?.AWS?.S3_BUCKET || process.env.AWS_S3_BUCKET || '';
    this.region = config?.AWS?.REGION || process.env.AWS_REGION || 'us-east-1';
    this.acl = config?.AWS?.S3_ACL || process.env.AWS_S3_ACL || 'public-read';
    this.cdnUrl = config?.AWS?.CDN_URL || process.env.CDN_URL || '';
    this.enableCdn = config?.AWS?.ENABLE_CDN || process.env.AWS_S3_ENABLE_CDN === 'true';
    this.cdnKeyPairId = config?.AWS?.CDN_KEY_PAIR_ID || process.env.AWS_CLOUDFRONT_KEY_PAIR_ID;
    this.cdnPrivateKey = config?.AWS?.CDN_PRIVATE_KEY || process.env.AWS_CLOUDFRONT_PRIVATE_KEY;
    this.cdnSignedUrlExpiry = parseInt(
      config?.AWS?.CDN_SIGNED_URL_EXPIRY || process.env.AWS_CLOUDFRONT_SIGNED_URL_EXPIRY || '3600',
      10
    );
    this.sseAlgorithm = config?.AWS?.S3_SSE || process.env.AWS_S3_SSE || 'AES256';
    this.kmsKeyId = config?.AWS?.KMS_KEY_ID || process.env.AWS_KMS_KEY_ID;

    // Validate required configuration
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is required in environment variables');
    }

    const useIamRole = process.env.AWS_USE_IAM_ROLE === 'true';
    let credentials;

    if (!useIamRole) {
      const accessKeyId = config?.AWS?.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
      const secretAccessKey =
        config?.AWS?.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';

      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          'AWS credentials (ACCESS_KEY_ID and SECRET_ACCESS_KEY) are required in environment variables'
        );
      }

      credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }
    // If useIamRole is true, credentials will be undefined and SDK will use instance role

    // Initialize S3 Client with retry strategy and timeouts
    this.s3Client = new S3Client({
      region: this.region,
      credentials,
      // Automatically follow region redirects (handles cases where bucket region differs)
      followRegionRedirects: true,
      // Retry configuration with exponential backoff
      // AWS SDK v3 uses default retry strategy, maxAttempts is set via maxAttemptsProvider
      maxAttempts: 3,
      // Request timeout configuration
      requestHandler: {
        requestTimeout: 30000, // 30 seconds
        httpsAgent: new https.Agent({
          keepAlive: true,
          maxSockets: 50,
          timeout: 30000,
        }),
      },
    });

    // Initialize logger
    this.logger = createLogger({ service: 'S3StorageProvider' });

    this.logger.info('S3 Storage Provider initialized', {
      bucket: this.bucket,
      region: this.region,
      sseAlgorithm: this.sseAlgorithm,
      useIamRole,
    });
  }

  async upload(file: Express.Multer.File, options: UploadOptions): Promise<UploadResult> {
    const startTime = Date.now();
    const logger = createLogger({
      operation: 'upload',
      fileKey: options.customFileName || file.originalname,
      fileSize: file.size,
      folder: options.folder,
    });

    try {
      if (options.folder === 'posts' && !options.userUuid) {
        throw new Error('User UUID is required for post uploads');
      }

      const fileName = options.customFileName || this.generateFileName(file);
      const key = this.buildPath(options, fileName);

      logger.info('Starting S3 upload', { fileKey: key });

      // Calculate MD5 for integrity verification
      let fileBuffer: Buffer | undefined;
      let fileStream: fs.ReadStream | undefined;
      let contentMD5: string | undefined;
      let fileSize: number;

      if (file.buffer) {
        fileBuffer = file.buffer;
        fileSize = fileBuffer.length;
        contentMD5 = this.calculateMD5(fileBuffer);
      } else if (file.path) {
        fileSize = (await fs.promises.stat(file.path)).size;
        fileStream = createReadStream(file.path);
        // For streaming, we'll skip MD5 (can be added with stream processing if needed)
      } else {
        throw new Error('File has no buffer or path');
      }

      // Use multipart upload for large files (>100MB)
      const useMultipart = fileSize > this.MULTIPART_THRESHOLD;

      if (useMultipart && fileStream) {
        logger.info('Using multipart upload for large file', { fileSize, fileKey: key });

        const upload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: this.bucket,
            Key: key,
            Body: fileStream,
            ContentType: file.mimetype,
            ACL: this.acl as any,
            ServerSideEncryption: this.sseAlgorithm as any,
            ...(this.kmsKeyId && { SSEKMSKeyId: this.kmsKeyId }),
            Metadata: {
              originalName: file.originalname,
              uploadedAt: new Date().toISOString(),
              folder: options.folder,
            },
          },
          partSize: 10 * 1024 * 1024, // 10MB parts
          leavePartsOnError: false,
        });

        await upload.done();
      } else {
        // Standard upload for smaller files
        const putCommand = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileBuffer || fileStream,
          ContentType: file.mimetype,
          ACL: this.acl as any,
          ServerSideEncryption: this.sseAlgorithm as any,
          ...(this.kmsKeyId && { SSEKMSKeyId: this.kmsKeyId }),
          ...(contentMD5 && { ContentMD5: contentMD5 }),
          Metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            folder: options.folder,
          },
        });

        await this.s3Client.send(putCommand);
      }

      const duration = Date.now() - startTime;
      logger.info('S3 upload completed', {
        fileKey: key,
        duration,
        fileSize,
        useMultipart,
      });

      return {
        fileKey: key,
        url: await this.getUrl(key),
        size: fileSize,
        mimeType: file.mimetype,
        originalName: file.originalname,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = this.classifyError(error);

      const errorToThrow = new Error(`Failed to upload file to S3: ${errorMessage.message}`);
      (errorToThrow as any).code = errorMessage.code;
      (errorToThrow as any).retryable = errorMessage.retryable;

      logger.error('S3 upload failed', {
        errorMessage: errorMessage.message,
        errorCode: errorMessage.code,
        duration,
        error: error instanceof Error ? error : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw errorToThrow;
    }
  }

  /**
   * Delete file from S3
   */
  async delete(fileKey: string): Promise<void> {
    const logger = createLogger({ operation: 'delete', fileKey });
    const startTime = Date.now();

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        })
      );

      const duration = Date.now() - startTime;
      logger.info('File deleted from S3', { fileKey, duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = this.classifyError(error);

      // Don't throw error if file doesn't exist (idempotent operation)
      if (errorMessage.code === 'NoSuchKey' || errorMessage.code === 'NotFound') {
        logger.warn('File not found during delete (already deleted?)', { fileKey, duration });
        return;
      }

      const errorToThrow = new Error(`Failed to delete file from S3: ${errorMessage.message}`);
      (errorToThrow as any).code = errorMessage.code;
      (errorToThrow as any).retryable = errorMessage.retryable;

      logger.error('Error deleting file from S3', {
        fileKey,
        errorMessage: errorMessage.message,
        errorCode: errorMessage.code,
        duration,
        error: error instanceof Error ? error : undefined,
      });

      throw errorToThrow;
    }
  }

  /**
   * Get URL for a file
   * Returns CDN URL if configured (with signed URL for private content),
   * presigned S3 URL if private, otherwise S3 public URL
   */
  async getUrl(fileKey: string): Promise<string> {
    const logger = createLogger({ operation: 'getUrl', fileKey });

    // If CDN is enabled and URL is configured
    if (this.enableCdn && this.cdnUrl) {
      // Ensure CDN URL doesn't have trailing slash
      const cdnBase = this.cdnUrl.endsWith('/') ? this.cdnUrl.slice(0, -1) : this.cdnUrl;
      const cdnPath = `/${fileKey}`;
      const cdnFullUrl = `${cdnBase}${cdnPath}`;

      // If ACL is private and CloudFront signing is configured, generate signed URL
      if (this.acl === 'private' && this.cdnKeyPairId && this.cdnPrivateKey) {
        try {
          logger.debug('Generating CloudFront signed URL', { fileKey });

          const signedUrl = getCloudFrontSignedUrl({
            url: cdnFullUrl,
            keyPairId: this.cdnKeyPairId,
            privateKey: this.cdnPrivateKey,
            dateLessThan: new Date(Date.now() + this.cdnSignedUrlExpiry * 1000).toISOString(),
          });

          logger.debug('CloudFront signed URL generated', { fileKey });
          return signedUrl;
        } catch (error) {
          logger.warn(
            'Failed to generate CloudFront signed URL, falling back to S3 presigned URL',
            {
              fileKey,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              error: error instanceof Error ? error : undefined,
            }
          );
          // Fall through to S3 presigned URL
        }
      } else if (this.acl === 'public-read') {
        // Public content - return direct CDN URL
        logger.debug('Returning public CDN URL', { fileKey });
        return cdnFullUrl;
      } else {
        // Private content but no CloudFront signing configured - fall back to S3 presigned
        logger.debug(
          'CDN enabled but no signing configured for private content, using S3 presigned URL',
          { fileKey }
        );
      }
    }

    // If ACL is private, generate S3 presigned URL (expires in 1 hour)
    if (this.acl === 'private') {
      // Extract filename from S3 key for Content-Disposition
      const filename = fileKey.split('/').pop() || 'file';

      // Try to get the Content-Type from S3 object metadata
      // This ensures we use the exact Content-Type that was set during upload
      let contentType: string | undefined;
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        });
        const headResponse = await this.s3Client.send(headCommand);
        contentType = headResponse.ContentType || undefined;
        logger.debug('Retrieved Content-Type from S3 object', { fileKey, contentType });
      } catch (error) {
        // If HeadObject fails (file doesn't exist or permission issue), don't set ResponseContentType
        // S3 will use the stored Content-Type automatically
        logger.warn('Could not retrieve Content-Type from S3, will use stored Content-Type', {
          fileKey,
        });
      }

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        // Only set ResponseContentType if we successfully retrieved it from S3
        // This ensures videos use the correct Content-Type to play inline
        ...(contentType && { ResponseContentType: contentType }),
        // Set ResponseContentDisposition to inline so videos play instead of downloading
        ResponseContentDisposition: `inline; filename="${filename}"`,
      });

      // Generate presigned URL that expires in 1 hour (3600 seconds)
      const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      logger.debug('Generated S3 presigned URL', {
        fileKey,
        contentType: contentType || 'using stored',
      });
      return presignedUrl;
    }

    // Otherwise, use S3 public URL
    // Format: https://{bucket}.s3.{region}.amazonaws.com/{key}
    const s3Url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fileKey}`;
    logger.debug('Returning S3 public URL', { fileKey });
    return s3Url;
  }

  /**
   * Check if file exists in S3
   */
  async exists(fileKey: string): Promise<boolean> {
    const logger = createLogger({ operation: 'exists', fileKey });

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        })
      );
      logger.debug('File exists in S3', { fileKey });
      return true;
    } catch (error: any) {
      const errorMessage = this.classifyError(error);

      // File doesn't exist if we get 404 or NoSuchKey error
      if (
        errorMessage.code === 'NotFound' ||
        errorMessage.code === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        logger.debug('File does not exist in S3', { fileKey });
        return false;
      }

      // For other errors, log and return false (safer than throwing)
      logger.error('Error checking if file exists in S3', {
        fileKey,
        errorMessage: errorMessage.message,
        errorCode: errorMessage.code,
        error: error instanceof Error ? error : undefined,
      });
      return false;
    }
  }

  /**
   * Calculate MD5 hash for file integrity verification
   */
  private calculateMD5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('base64');
  }

  /**
   * Classify S3 errors for better error handling
   */
  private classifyError(error: unknown): { message: string; code: string; retryable: boolean } {
    if (error instanceof S3ServiceException) {
      const code = error.name || error.$metadata?.httpStatusCode?.toString() || 'Unknown';
      const message = error.message || 'Unknown S3 error';

      // Determine if error is retryable
      const retryableCodes = [
        'RequestTimeout',
        'ServiceUnavailable',
        'Throttling',
        'InternalError',
        'SlowDown',
      ];
      const httpStatusCode = error.$metadata?.httpStatusCode;
      const retryable =
        retryableCodes.includes(code) || (httpStatusCode !== undefined && httpStatusCode >= 500);

      return { message, code, retryable };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.name || 'Unknown',
        retryable: false,
      };
    }

    return {
      message: 'Unknown error',
      code: 'Unknown',
      retryable: false,
    };
  }

  private buildPath(options: UploadOptions, fileName: string): string {
    const parts: string[] = [options.folder];

    if (options.folder === 'posts' && options.userUuid) {
      parts.push(options.userUuid);
    }

    if (options.subFolder) {
      parts.push(options.subFolder);
    }

    parts.push(fileName);

    return parts.join('/');
  }

  /**
   * Generate unique filename
   * Matches local storage format for consistency
   */
  private generateFileName(file: Express.Multer.File): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);

    // Sanitize original filename
    const sanitized = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 30);

    return `${timestamp}_${random}_${sanitized}${ext}`;
  }
}
