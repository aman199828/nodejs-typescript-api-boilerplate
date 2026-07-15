import config from '../config/config';
import { getStorageProvider } from '../services/storage';
import { S3StorageProvider } from '../services/storage/s3.storage';
import { STORAGE_TYPES } from '../constants/storage.constants';

/**
 * Get file URL with full domain
 * Handles various path formats and prevents double slashes
 */
export const getFileUrl = (
  filePath: string | null,
  folder: string = 'profile_file'
): string | null => {
  if (!filePath) return null;

  // If it's already a full URL, return as is
  if (filePath.startsWith('http')) {
    return filePath;
  }

  // Normalize filePath: strip /uploads/ prefix if present
  let cleaned = filePath.trim();

  // Remove /uploads/ prefix if present (with or without leading slash)
  if (cleaned.startsWith('/uploads/')) {
    cleaned = cleaned.slice('/uploads/'.length);
  } else if (cleaned.startsWith('uploads/')) {
    cleaned = cleaned.slice('uploads/'.length);
  }

  // Remove any leading slashes
  cleaned = cleaned.replace(/^\/+/, '');

  if (!cleaned) return null;

  // Extract folder and filename from the path
  const parts = cleaned.split('/').filter(Boolean);

  // If the path already contains the folder structure (e.g., "profile_file/filename.png" or "posts/uuid/images/file.jpg")
  // use it as is - don't add the folder parameter again
  if (parts.length > 1) {
    const folderAndFile = parts.join('/');
    // Remove any double slashes
    const normalized = folderAndFile.replace(/\/+/g, '/');
    return `${config.APP_URL}/file/download/${normalized}`;
  }

  // Otherwise, if it's just a filename, use the provided folder
  const filename = parts[0];
  if (!filename) return null;

  // Construct the full URL
  return `${config.APP_URL}/file/download/${folder}/${filename}`;
};

/**
 * Get file URL based on storage type from database
 * Uses S3 storage provider if storageType is 's3', otherwise uses local file URL
 * Returns direct S3 URL (CDN, presigned, or public) - no redirects
 *
 * @param filePath - Base path (e.g., "images/filename.jpg") or full S3 key
 * @param storageType - Storage type from database ('s3' or 'local')
 * @param folder - Folder type ('posts', 'clips', 'shop', 'profile_file', etc.)
 * @param userUuid - Optional user UUID for posts/clips/shop to construct full S3 key
 */
export const getFileUrlWithStorage = async (
  filePath: string | null,
  storageType: string | null,
  folder: string = 'profile_file',
  userUuid?: string
): Promise<string | null> => {
  if (!filePath) return null;

  // If it's already a full URL, return it as-is (no modification)
  if (filePath.startsWith('http')) {
    return filePath;
  }

  // If storage type is S3, ALWAYS use S3 provider (regardless of STORAGE_PROVIDER env var)
  // This ensures files marked as S3 in database always get S3 URLs (presigned/CDN)
  // SECURITY: Only use S3 URLs when explicitly marked as S3 in database
  // This prevents:
  // - Unnecessary S3 API calls
  // - Exposing S3 bucket structure for non-existent files
  // - Security issues from guessing file locations
  if (storageType === STORAGE_TYPES.S3) {
    try {
      // Always use S3 provider when storageType is S3, even if STORAGE_PROVIDER env is 'local'
      // This ensures files uploaded directly to S3 get proper presigned URLs
      const storage = new S3StorageProvider();

      // For chat files: use path as-is (includes public/uploads/ prefix)
      // For other files: clean path to remove prefix
      let cleanedPath = filePath;
      if (folder === 'chat') {
        // Chat files are stored with full path including public/uploads/ prefix
        // Use path as-is - no cleaning needed
        cleanedPath = filePath;
      } else {
        // For other folders (posts, clips, shop), clean the path
        if (cleanedPath.includes('public/uploads/')) {
          cleanedPath = cleanedPath.split('public/uploads/')[1];
          console.log(`[getFileUrlWithStorage] Cleaned path: ${filePath} -> ${cleanedPath}`);
        } else if (cleanedPath.includes('uploads/')) {
          cleanedPath = cleanedPath.split('uploads/')[1];
          console.log(`[getFileUrlWithStorage] Cleaned path: ${filePath} -> ${cleanedPath}`);
        }
      }

      // Determine the S3 key path
      let s3Key = cleanedPath;

      // For posts, clips, and shop: construct full S3 key from base path + user UUID
      // Final format: posts/{userUuid}/{filename} (no subfolder)
      // Stored path format: posts/{userUuid}/{filename} OR just {filename}
      if ((folder === 'posts' || folder === 'clips' || folder === 'shop') && userUuid) {
        // If filePath already contains the full path with correct userUuid, use it as-is
        if (cleanedPath.includes(`${folder}/`) && cleanedPath.includes(userUuid)) {
          s3Key = cleanedPath; // Already full path: posts/{userUuid}/{filename}
        } else if (cleanedPath.startsWith(`${folder}/`)) {
          // Path starts with posts/ but has wrong UUID - replace UUID with correct one
          // e.g., posts/wrong-uuid/filename.jpg -> posts/{correctUuid}/filename.jpg
          const parts = cleanedPath.split('/');
          if (parts.length >= 3) {
            // Extract filename and reconstruct with correct UUID
            const filename = parts.slice(2).join('/'); // Handle case where filename might have slashes
            s3Key = `${folder}/${userUuid}/${filename}`;
          } else {
            s3Key = `${folder}/${userUuid}/${cleanedPath}`;
          }
        } else {
          // Construct full S3 key from base path: {folder}/{userUuid}/{filename}
          // Base path is just the filename
          s3Key = `${folder}/${userUuid}/${cleanedPath}`;
        }
      }
      // If filePath doesn't contain slashes, it's just a filename
      // Construct the S3 key based on folder (for old files that weren't uploaded with full path)
      else if (!filePath.includes('/')) {
        // For songs, the structure is: songs/audio/filename.mp3
        if (folder === 'songs') {
          s3Key = `songs/audio/${filePath}`;
        }
        // For covers, the structure is: covers/filename.jpg
        else if (folder === 'covers') {
          s3Key = `covers/${filePath}`;
        }
        // For other folders, use folder/filename
        else {
          s3Key = `${folder}/${filePath}`;
        }
      }

      // ⚡ CRITICAL: Add 'uploads/' or 'public/uploads/' prefix for posts/clips/shop/chat to match actual S3 storage location
      // Chat files: stored with full path including public/uploads/ prefix - use as-is
      // Posts/clips/shop: stored without prefix - add uploads/ prefix when generating URLs
      let finalS3Key = s3Key;

      // For chat: use path as-is (already includes public/uploads/ prefix)
      if (folder === 'chat') {
        finalS3Key = cleanedPath; // Use as-is, already has public/uploads/ prefix
      }
      // For posts/clips/shop: add uploads/ prefix if not present
      else if (
        (folder === 'posts' || folder === 'clips' || folder === 'shop') &&
        !s3Key.startsWith('uploads/') &&
        !s3Key.startsWith('public/')
      ) {
        finalS3Key = `uploads/${s3Key}`;
        console.log(`[getFileUrlWithStorage] Added uploads/ prefix: ${s3Key} -> ${finalS3Key}`);
      }

      // Try to generate S3 URL directly
      // Note: We don't check if file exists first because:
      // 1. For newly created posts, files should exist (just uploaded)
      // 2. Existence check can fail due to timing/permissions, but URL generation might still work
      // 3. S3 getUrl() will handle missing files gracefully (returns URL that gives 404 if file doesn't exist)
      // If there's an actual error generating the URL, we'll catch it and fall back

      // Returns:
      // - CDN URL if CDN is enabled
      // - Presigned URL (expires in 1 hour) if ACL is private
      // - Public S3 URL if ACL is public-read
      return await storage.getUrl(finalS3Key);
    } catch (error) {
      // If S3 lookup fails, log error and fall back to local URL
      console.error(`Failed to get S3 URL for ${filePath}:`, error);
      // Fall back to local URL endpoint which will handle the redirect
      return getFileUrl(filePath, folder);
    }
  }

  // For local storage, use existing getFileUrl
  // This returns /file/download/ URL which will:
  // - Serve local files directly
  // - Redirect to S3 if FileController detects file is actually in S3
  const storage = getStorageProvider();
  return getFileUrl(filePath, folder);
};
