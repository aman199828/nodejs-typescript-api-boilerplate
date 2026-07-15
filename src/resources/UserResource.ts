import { BaseResource } from './BaseResource';
import config from '../config/config';
import { getFileUrlWithStorage } from '../utils/file.utils';

export interface UserData {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  profileFile?: string | null;
  isAdmin: boolean;
  isVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserResource extends BaseResource {
  private user: UserData;

  constructor(user: UserData) {
    super();
    this.user = user;
  }

  toJSON() {
    return {
      id: this.user.id,
      email: this.user.email,
      firstName: this.user.firstName,
      lastName: this.user.lastName,
      name: this.user.name,
      profileFile: this.user.profileFile ? this.getProfileImageUrl() : null,
      isAdmin: this.user.isAdmin,
      isVerified: this.user.isVerified,
      isActive: this.user.isActive,
      lastLoginAt: this.user.lastLoginAt,
      createdAt: this.user.createdAt,
      updatedAt: this.user.updatedAt,
    };
  }

  private getProfileImageUrl(): string | null {
    if (!this.user.profileFile) return null;

    // If it's already a full URL, return as is
    if (this.user.profileFile.startsWith('http')) {
      return this.user.profileFile;
    }

    // Construct the full URL like Laravel's file download
    const baseUrl = config.APP_URL;
    return `${baseUrl}/file/download/profile_file/${this.user.profileFile}`;
  }

  /**
   * Static method to transform user to minimal format (for nested objects)
   * Used in StoryResource, PostResource, etc.
   */
  static async minimal(user: any) {
    const profileFileUrl = user.profileFile
      ? await getFileUrlWithStorage(
          user.profileFile,
          user.profileFileStorage || 'local',
          'profile_file'
        )
      : null;

    return {
      id: user.id,
      name: user.name,
      userName: user.userName,
      profileFile: profileFileUrl,
      profession: user.profession || null,
    };
  }
}
