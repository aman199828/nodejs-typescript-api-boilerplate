import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '../resources/ApiResponse';
import { PrismaClient } from '@prisma/client';
import { getStorageProvider } from '../services/storage';
import { STORAGE_TYPES } from '../constants/storage.constants';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageProvider } from '../services/storage/s3.storage';

import { prisma } from '../lib/prisma';

export class FileController {
  /**
   * Stream file from S3
   */
  private async streamFromS3(
    res: Response,
    s3Key: string,
    storage: any,
    filename: string
  ): Promise<boolean> {
    try {
      // Check if storage is S3StorageProvider
      if (!(storage instanceof S3StorageProvider)) {
        return false;
      }

      // Access private properties via type assertion (we know it's S3StorageProvider)
      const s3Client = (storage as any).s3Client;
      const bucket = (storage as any).bucket;

      if (!s3Client || !bucket) {
        return false;
      }

      // Check if file exists in S3
      const exists = await storage.exists(s3Key);
      if (!exists) {
        return false;
      }

      // Get file from S3
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(command);

      // Set headers
      res.setHeader('Content-Type', this.getMimeType(filename));
      res.setHeader('Content-Length', s3Response.ContentLength || 0);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Frame-Options', 'DENY');

      // Stream from S3
      if (s3Response.Body) {
        (s3Response.Body as any).pipe(res);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error streaming from S3:', error);
      return false;
    }
  }
  /**
   * Download file endpoint - supports both simple and nested paths
   * URL Examples:
   * - /file/download/profile_file/filename.jpg
   * - /file/download/posts/{uuid}/images/filename.jpg
   * - /file/download/posts/{uuid}/videos/filename.mp4
   *
   * Handles both local files and S3 files by checking database storage type
   */
  downloadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      // ⚡ SECURITY: Verify user is authenticated (safety check)
      // TODO: Re-enable authentication when ready
      // const userId = (req as any).user?.id;
      // if (!userId) {
      //   res.status(401).json(ApiResponse.unauthorized('Authentication required to access files'));
      //   return;
      // }

      // Get the full path after /file/download/
      // req.params[0] contains the regex capture group
      const requestedPath = req.params[0] || '';

      // Security check: prevent directory traversal
      if (requestedPath.includes('..') || requestedPath.includes('~')) {
        res.status(400).json(ApiResponse.error('Invalid file path', 400));
        return;
      }

      // Extract the base folder (first part of path)
      const pathParts = requestedPath.split('/');
      const baseFolder = pathParts[0];

      // Validate base folder (security check)
      const allowedFolders = [
        'profile_file',
        'documents',
        'images',
        'cover_images',
        'songs',
        'covers',
        'posts',
      ];
      if (!allowedFolders.includes(baseFolder)) {
        res.status(400).json(ApiResponse.error('Invalid folder specified', 400));
        return;
      }

      // Check if file is in S3 by querying database
      const storage = getStorageProvider();

      // For posts: check PostMedia table
      if (baseFolder === 'posts' && pathParts.length >= 4) {
        // Format: posts/{uuid}/{images|videos}/{filename}
        const uuid = pathParts[1];
        const subFolder = pathParts[2];
        const filename = pathParts.slice(3).join('/');

        // Find post media by matching the media key
        // const mediaKey = `posts/${uuid}/${subFolder}/${filename}`;
        // const postMedia = await prisma.postMedia.findFirst({
        //   where: {
        //     mediaUrl: mediaKey
        //   } as any
        // });

        // if (postMedia) {
        //   // Check storage type and handle accordingly
        //   if (postMedia.mediaUrlStorage === STORAGE_TYPES.S3) {
        //     // File is marked as S3, try to stream from S3
        //     const streamed = await this.streamFromS3(res, mediaKey, storage, path.basename(mediaKey));
        //     if (streamed) {
        //       return; // File streamed successfully from S3
        //     }
        //     // If S3 streaming failed, fall back to local file check
        //     // This handles cases where database says S3 but file is actually local
        //   }
        //   // If storage is local (or S3 streaming failed), continue to local file check below
        //   // The local file check will verify the file exists on disk
        // }
      }

      // For profile files: check User table
      if (baseFolder === 'profile_file' && pathParts.length >= 2) {
        const filename = pathParts.slice(1).join('/');
        // Try different key formats
        const possibleKeys = [`profile_file/${filename}`, filename];

        let user = null;
        let actualS3Key = null;

        for (const key of possibleKeys) {
          user = await prisma.user.findFirst({
            where: {
              profileFile: key,
              profileFileStorage: STORAGE_TYPES.S3,
            } as any,
          });

          if (user) {
            actualS3Key = user.profileFile;
            break;
          }
        }

        if (user && actualS3Key) {
          // File is in S3, construct full S3 key if needed
          // If database stores just filename, add folder prefix
          let s3Key = actualS3Key;
          if (!actualS3Key.includes('/')) {
            s3Key = `profile_file/${actualS3Key}`;
          }
          // Try to stream from S3, fall back to local if not found
          const streamed = await this.streamFromS3(res, s3Key, storage, path.basename(s3Key));
          if (streamed) {
            return; // File streamed successfully
          }
          // If S3 streaming failed, continue to local file check
        }
      }

      // For cover images: check User table
      if (baseFolder === 'cover_images' && pathParts.length >= 2) {
        const filename = pathParts.slice(1).join('/');
        // Try different key formats
        const possibleKeys = [`cover_images/${filename}`, filename];

        let user = null;
        let actualS3Key = null;

        for (const key of possibleKeys) {
          user = await prisma.user.findFirst({
            where: {
              coverImage: key,
              coverImageStorage: STORAGE_TYPES.S3,
            } as any,
          });

          if (user) {
            actualS3Key = user.coverImage;
            break;
          }
        }

        if (user && actualS3Key) {
          // File is in S3, construct full S3 key if needed
          // If database stores just filename, add folder prefix
          let s3Key = actualS3Key;
          if (!actualS3Key.includes('/')) {
            s3Key = `cover_images/${actualS3Key}`;
          }
          // Try to stream from S3, fall back to local if not found
          const streamed = await this.streamFromS3(res, s3Key, storage, path.basename(s3Key));
          if (streamed) {
            return; // File streamed successfully
          }
          // If S3 streaming failed, continue to local file check
        }
      }

      // For songs: check Song table
      if (baseFolder === 'songs' && pathParts.length >= 2) {
        const filename = pathParts.slice(1).join('/');
        // Try different key formats: songs/audio/filename or songs/filename or just filename
        const possibleKeys = [`songs/audio/${filename}`, `songs/${filename}`, filename];

        // let song = null;
        // let actualS3Key = null;

        // // Try to find song with any of the possible keys
        // for (const key of possibleKeys) {
        //   song = await prisma.song.findFirst({
        //     where: {
        //       audioFile: key,
        //       audioFileStorage: STORAGE_TYPES.S3
        //     } as any
        //   });

        //   if (song) {
        //     actualS3Key = song.audioFile; // Use the actual key from database
        //     break;
        //   }
        // }

        // // Also try matching just the filename (for old files stored as just filename)
        // if (!song) {
        //   song = await prisma.song.findFirst({
        //     where: {
        //       audioFile: filename,
        //       audioFileStorage: STORAGE_TYPES.S3
        //     } as any
        //   });
        //   if (song) {
        //     actualS3Key = song.audioFile;
        //   }
        // }

        // if (song && actualS3Key) {
        if (false) {
          // Disabled - domain-specific feature (Song audio streaming from S3)
        }
      }

      // For song covers: check Song table
      if (baseFolder === 'covers' && pathParts.length >= 2) {
        const filename = pathParts.slice(1).join('/');
        // Try different key formats: covers/filename or just filename
        const possibleKeys = [`covers/${filename}`, filename];

        // let song = null;
        // let actualS3Key = null;

        // // Try to find song with any of the possible keys
        // for (const key of possibleKeys) {
        //   song = await prisma.song.findFirst({
        //     where: {
        //       coverImage: key,
        //       coverImageStorage: STORAGE_TYPES.S3
        //     } as any
        //   });

        //   if (song) {
        //     actualS3Key = song.coverImage; // Use the actual key from database
        //     break;
        //   }
        // }

        // if (song && actualS3Key) {
        if (false) {
          // Disabled - domain-specific feature (Song cover streaming from S3)
        }
      }

      // For other folders or if not found in S3, check local storage
      // Construct full file path
      const filePath = path.join(process.cwd(), 'public', 'uploads', requestedPath);

      // Check if file exists locally
      if (!fs.existsSync(filePath)) {
        res.status(404).json(ApiResponse.notFound('File not found'));
        return;
      }

      // Verify it's a file, not a directory
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        res.status(400).json(ApiResponse.error('Invalid file path', 400));
        return;
      }

      // Get filename for headers
      const filename = path.basename(filePath);

      // Set appropriate headers with security
      res.setHeader('Content-Type', this.getMimeType(filename));
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600'); // Private cache, 1 hour
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Frame-Options', 'DENY'); // Prevent embedding

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('File download error:', error);
      res.status(500).json(ApiResponse.serverError('Error downloading file'));
    }
  };

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',

      // Videos
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',

      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',

      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Upload file endpoint
   */
  uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json(ApiResponse.error('No file uploaded', 400));
        return;
      }

      const { folder } = req.params;
      const folderStr = Array.isArray(folder) ? folder[0] : folder;
      const allowedFolders = ['profile_file', 'documents', 'images', 'cover_images'];

      if (!allowedFolders.includes(folderStr)) {
        res.status(400).json(ApiResponse.error('Invalid folder specified', 400));
        return;
      }

      // Move file to correct folder
      const oldPath = req.file.path;
      const newPath = path.join(process.cwd(), 'public', 'uploads', folderStr, req.file.filename);

      // Ensure directory exists
      const dir = path.dirname(newPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Move file
      fs.renameSync(oldPath, newPath);

      // Return file info
      res.status(200).json(
        ApiResponse.success(
          {
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            url: `/file/download/${folderStr}/${req.file.filename}`,
          },
          'File uploaded successfully'
        )
      );
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json(ApiResponse.serverError('Error uploading file'));
    }
  };
}
