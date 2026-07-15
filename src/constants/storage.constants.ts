/**
 * Storage Provider Constants
 * Defines storage types and helper functions
 */

export const STORAGE_TYPES = {
  LOCAL: 'local',
  S3: 's3',
} as const;

export type StorageType = (typeof STORAGE_TYPES)[keyof typeof STORAGE_TYPES];

/**
 * Get current storage provider type from environment
 * @returns 'local' or 's3'
 */
export const getCurrentStorageType = (): StorageType => {
  const provider = process.env.STORAGE_PROVIDER || 'local';
  return provider.toLowerCase() === 's3' ? STORAGE_TYPES.S3 : STORAGE_TYPES.LOCAL;
};
