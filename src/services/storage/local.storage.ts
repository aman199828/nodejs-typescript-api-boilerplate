import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, UploadOptions, UploadResult } from './storage.interface';

let config: any;
try {
  config = require('../../config/config').default;
} catch {
  config = null; // Config file doesn't exist - use env vars only
}

/**
 * Local filesystem storage provider
 * Stores files in public/uploads directory
 */
export class LocalStorageProvider implements StorageProvider {
  private basePath = 'public/uploads';
  private baseUrl: string;

  constructor() {
    this.baseUrl = config?.APP_URL || process.env.APP_URL || 'http://localhost:3000';
  }

  /**
   * Upload file to local filesystem
   * ⚡ OPTIMIZED: Uses fast file move for disk storage, streams for memory storage
   */
  async upload(file: Express.Multer.File, options: UploadOptions): Promise<UploadResult> {
    try {
      // Validate required options
      if (options.folder === 'posts' && !options.userUuid) {
        throw new Error('User UUID is required for post uploads');
      }

      // Generate filename
      const fileName = options.customFileName || this.generateFileName(file);

      // Build path based on folder structure
      const relativePath = this.buildPath(options, fileName);
      const fullPath = path.join(this.basePath, relativePath);

      // ⚡ OPTIMIZATION: Create directory in parallel (non-blocking if already exists)
      // Using mkdir with recursive is faster than checking exists first
      const dirPath = path.dirname(fullPath);
      await fs.promises.mkdir(dirPath, { recursive: true }).catch((err: NodeJS.ErrnoException) => {
        // Ignore EEXIST errors (directory already exists) - this is expected and fine
        if (err.code !== 'EEXIST') {
          throw err;
        }
      });

      // ⚡ OPTIMIZATION: If file is already on disk (from multer diskStorage), use fast move
      // Since temp dir is within public/uploads, rename is guaranteed to be instant (same filesystem)
      if (file.path) {
        // File is already on disk (from multer diskStorage) - use atomic move
        // This is essentially instant on same filesystem (no data copying, just metadata update)
        // Removed existsSync check - rename will fail fast if file doesn't exist
        await fs.promises.rename(file.path, fullPath);

        // Use file.size from multer (already available, no disk read needed)
        const fileSize = file.size;

        const result: UploadResult = {
          fileKey: relativePath,
          url: await this.getUrl(relativePath),
          size: fileSize,
          mimeType: file.mimetype,
          originalName: file.originalname,
        };

        return result;
      }

      // Fallback: File is in memory (from multer memoryStorage) - write to disk
      // This happens for small files or if memory storage is used
      if (file.buffer) {
        const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB

        if (file.buffer.length > LARGE_FILE_THRESHOLD) {
          // Use stream for large in-memory files
          const writeStream = fs.createWriteStream(fullPath);
          await new Promise<void>((resolve, reject) => {
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            writeStream.write(file.buffer);
            writeStream.end();
          });
        } else {
          // Use writeFile for small files
          await fs.promises.writeFile(fullPath, file.buffer);
        }
      } else {
        throw new Error('File has no buffer or path');
      }

      // Get file size
      const fileSize = file.size || (file.buffer ? file.buffer.length : 0);

      const result: UploadResult = {
        fileKey: relativePath,
        url: await this.getUrl(relativePath),
        size: fileSize,
        mimeType: file.mimetype,
        originalName: file.originalname,
      };

      return result;
    } catch (error) {
      console.error('Error uploading file to local storage:', error);
      throw new Error(
        `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete file from local filesystem
   */
  async delete(fileKey: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, fileKey);

      if (await this.exists(fileKey)) {
        await fs.promises.unlink(fullPath);
      }
    } catch (error) {
      console.error('Error deleting file from local storage:', error);
      throw new Error(
        `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get public URL for a file
   */
  async getUrl(fileKey: string): Promise<string> {
    return `${this.baseUrl}/file/download/${fileKey}`;
  }

  /**
   * Check if file exists
   */
  async exists(fileKey: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, fileKey);
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build file path based on options
   */
  private buildPath(options: UploadOptions, fileName: string): string {
    const parts: string[] = [options.folder];

    // For posts, use user UUID as subfolder
    if (options.folder === 'posts' && options.userUuid) {
      parts.push(options.userUuid);
    }

    // Add subfolder if specified (images, videos, thumbnails)
    if (options.subFolder) {
      parts.push(options.subFolder);
    }

    // Add filename
    parts.push(fileName);

    return parts.join('/');
  }

  /**
   * Generate unique filename
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

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Generate image variants (thumbnail, compressed)
   * TODO: Implement using sharp library
   */
  // private async generateImageVariants(
  //   filePath: string,
  //   options: UploadOptions
  // ): Promise<UploadResult['variants']> {
  //   // Implementation for future
  //   return undefined;
  // }
}
