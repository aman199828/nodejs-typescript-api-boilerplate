/**
 * Storage Service Module
 * Provides abstraction layer for file storage
 * Supports local filesystem and cloud storage (S3, etc.)
 */

export * from './storage.interface';
export * from './local.storage';
export * from './s3.storage';
export * from './storage.factory';
export { StorageFactory as default } from './storage.factory';
