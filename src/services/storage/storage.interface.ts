import { Express } from 'express';

/**
 * Storage folder constants
 * Centralized folder names for file uploads
 */
export const STORAGE_FOLDERS = {
  POSTS: 'posts',
  SONGS: 'songs',
  COVERS: 'covers',
  PROFILE_FILE: 'profile_file',
  DOCUMENTS: 'documents',
  STORIES: 'stories',
  CHAT: 'chat',
} as const;

/**
 * Storage sub-folder constants
 * Sub-folders within main folders
 */
export const STORAGE_SUB_FOLDERS = {
  IMAGES: 'images',
  VIDEOS: 'videos',
  THUMBNAILS: 'thumbnails',
  AUDIO: 'audio',
} as const;

/**
 * Type for storage folder names
 */
export type StorageFolder = (typeof STORAGE_FOLDERS)[keyof typeof STORAGE_FOLDERS];

/**
 * Type for storage sub-folder names
 */
export type StorageSubFolder = (typeof STORAGE_SUB_FOLDERS)[keyof typeof STORAGE_SUB_FOLDERS];

/**
 * Storage provider interface for abstracting file storage
 * Supports both local filesystem and cloud storage (S3, etc.)
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param file - Multer file object
   * @param options - Upload configuration options
   * @returns Upload result with file key and URL
   */
  upload(file: Express.Multer.File, options: UploadOptions): Promise<UploadResult>;

  /**
   * Delete a file from storage
   * @param fileKey - The file identifier (path or key)
   */
  delete(fileKey: string): Promise<void>;

  /**
   * Get the public URL for a file
   * @param fileKey - The file identifier (path or key)
   * @returns Full URL to access the file (presigned URL for private S3 files)
   */
  getUrl(fileKey: string): Promise<string>;

  /**
   * Check if a file exists in storage
   * @param fileKey - The file identifier (path or key)
   */
  exists?(fileKey: string): Promise<boolean>;
}

/**
 * Simplified options for uploading files
 */
export interface UploadOptions {
  /** Main folder: posts, songs, covers, profile_file, documents, stories */
  folder: StorageFolder;

  /** Sub-folder: images, videos, thumbnails, audio (optional) */
  subFolder?: StorageSubFolder;

  /** User's UUID (required for posts folder) */
  userUuid?: string;

  /** Custom filename (auto-generated if not provided) */
  customFileName?: string;
}

/**
 * Result after successful file upload
 */
export interface UploadResult {
  /** File identifier (relative path or S3 key) - store this in database */
  fileKey: string;

  /** Full public URL to access the file */
  url: string;

  /** File size in bytes */
  size: number;

  /** MIME type of the file */
  mimeType: string;

  /** Generated variants (thumbnail, compressed, etc.) */
  variants?: {
    thumbnail?: {
      fileKey: string;
      url: string;
    };
    compressed?: {
      fileKey: string;
      url: string;
    };
  };

  /** Original filename */
  originalName?: string;

  /** Dimensions for images/videos */
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Storage provider types
 */
export enum StorageProviderType {
  LOCAL = 'local',
  S3 = 's3',
  CLOUDINARY = 'cloudinary',
}
