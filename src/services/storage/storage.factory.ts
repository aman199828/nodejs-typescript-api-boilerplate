import { StorageProvider, StorageProviderType } from './storage.interface';
import { LocalStorageProvider } from './local.storage';
import { S3StorageProvider } from './s3.storage';

/**
 * Storage Factory
 * Creates the appropriate storage provider based on configuration
 */
export class StorageFactory {
  private static instance: StorageProvider | null = null;

  /**
   * Get storage provider instance (singleton)
   * Provider type is determined by STORAGE_PROVIDER env variable
   * Defaults to 'local' if not specified
   */
  static getProvider(): StorageProvider {
    if (!this.instance) {
      const providerType = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

      switch (providerType) {
        case StorageProviderType.S3:
          console.log('Using S3 Storage Provider');
          this.instance = new S3StorageProvider();
          break;

        case StorageProviderType.LOCAL:
        default:
          console.log('Using Local Storage Provider');
          this.instance = new LocalStorageProvider();
          break;
      }
    }

    return this.instance;
  }

  /**
   * Reset the provider instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Set a custom provider (useful for testing)
   */
  static setProvider(provider: StorageProvider): void {
    this.instance = provider;
  }
}

/**
 * Convenience function to get storage provider
 */
export const getStorageProvider = (): StorageProvider => {
  return StorageFactory.getProvider();
};
