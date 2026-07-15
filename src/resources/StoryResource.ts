import { getFileUrlWithStorage } from '../utils/file.utils';
import { UserResource } from './UserResource';

export class StoryResource {
  /**
   * Transform a single story
   * @param story - Story data from database
   * @param options - Transformation options
   */
  static async transform(
    story: any,
    options: {
      includeUser?: boolean;
      isViewed?: boolean;
      recentViewers?: any[];
    } = {}
  ): Promise<any> {
    const { includeUser = true, isViewed = false, recentViewers = [] } = options;

    // Generate URLs for media files (use first media from array if available, otherwise use top-level fields)
    let mediaUrl: string | null = null;
    let mediaType: string = story.mediaType;
    let thumbnailUrl: string | null = null;
    let duration: number | null = story.duration;

    // If media array exists, use the first media item
    if (story.media && Array.isArray(story.media) && story.media.length > 0) {
      const firstMedia = story.media[0];
      const [url, thumbnail] = await Promise.all([
        getFileUrlWithStorage(firstMedia.mediaUrl, firstMedia.mediaUrlStorage, 'stories'),
        firstMedia.thumbnail
          ? getFileUrlWithStorage(firstMedia.thumbnail, firstMedia.thumbnailStorage, 'stories')
          : Promise.resolve(null),
      ]);
      mediaUrl = url;
      mediaType = firstMedia.mediaType;
      thumbnailUrl = thumbnail;
      duration = firstMedia.duration;
    } else {
      // Use top-level fields for backward compatibility
      const [url, thumbnail] = await Promise.all([
        getFileUrlWithStorage(story.mediaUrl, story.mediaUrlStorage, 'stories'),
        story.thumbnail
          ? getFileUrlWithStorage(story.thumbnail, story.thumbnailStorage, 'stories')
          : Promise.resolve(null),
      ]);
      mediaUrl = url;
      thumbnailUrl = thumbnail;
    }

    // Generate audio URL
    const audioUrl = story.audioUrl
      ? await getFileUrlWithStorage(story.audioUrl, story.audioUrlStorage, 'stories')
      : null;

    // Generate song URLs if song is included
    let song: any = null;
    if (story.song) {
      const [audioFileUrl, coverImageUrl] = await Promise.all([
        getFileUrlWithStorage(story.song.audioFile, story.song.audioFileStorage, 'songs'),
        story.song.coverImage
          ? getFileUrlWithStorage(story.song.coverImage, story.song.coverImageStorage, 'covers')
          : Promise.resolve(null),
      ]);

      song = {
        id: story.song.id,
        title: story.song.title,
        artist: story.song.artist,
        audioFile: audioFileUrl,
        coverImage: coverImageUrl,
        duration: story.song.duration,
      };
    }

    // Calculate remaining time in seconds
    const now = new Date();
    const expiresAt = new Date(story.expiresAt);
    const remainingTime = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    // Build transformed object with top-level media fields only (no media array)
    // Create a clean object with ONLY the fields we want - explicitly exclude media array
    // IMPORTANT: We must create a completely new object to avoid any Prisma object references

    // Build the base object with primitive values only
    const baseObject: any = {
      id: Number(story.id),
      caption: story.caption ? String(story.caption) : null,
      mediaUrl: mediaUrl ? String(mediaUrl) : null,
      mediaType: mediaType ? String(mediaType) : null,
      thumbnail: thumbnailUrl ? String(thumbnailUrl) : null,
      duration: duration !== null && duration !== undefined ? Number(duration) : null,
      visibility: String(story.visibility),
      viewCount: Number(story.viewCount),
      isViewed: Boolean(isViewed),
      remainingTime: Number(remainingTime),
      createdAt:
        story.createdAt instanceof Date ? story.createdAt.toISOString() : String(story.createdAt),
      expiresAt:
        story.expiresAt instanceof Date ? story.expiresAt.toISOString() : String(story.expiresAt),
    };

    // Add song if it exists
    if (song) {
      baseObject.song = {
        id: Number(song.id),
        title: String(song.title),
        artist: String(song.artist),
        audioFile: song.audioFile ? String(song.audioFile) : null,
        coverImage: song.coverImage ? String(song.coverImage) : null,
        duration: Number(song.duration),
      };
    } else {
      baseObject.song = null;
    }

    // Add sound if it exists
    if (audioUrl) {
      baseObject.sound = {
        audioUrl: String(audioUrl),
        audioDuration: story.audioDuration ? Number(story.audioDuration) : null,
      };
    } else {
      baseObject.sound = null;
    }

    // Include user if requested
    if (includeUser && story.user) {
      baseObject.user = await UserResource.minimal(story.user);
    }

    // Add recent viewers if provided
    if (recentViewers.length > 0) {
      baseObject.recentViewers = await Promise.all(
        recentViewers.map(viewer => UserResource.minimal(viewer))
      );
    } else {
      baseObject.recentViewers = [];
    }

    // CRITICAL: Use JSON parse/stringify to create a completely clean object
    // This strips out ANY properties that might have been added by Prisma or getters
    const cleanTransformed = JSON.parse(JSON.stringify(baseObject));

    // Final verification - ensure media is absolutely not present
    if (cleanTransformed.media !== undefined) {
      delete cleanTransformed.media;
    }

    // Return the clean object - media array will NEVER be in this object
    return cleanTransformed;
  }

  /**
   * Transform a collection of stories
   * @param stories - Array of story data from database
   * @param options - Transformation options
   */
  static async collection(
    stories: any[],
    options: {
      includeUser?: boolean;
      viewedStoryIds?: Set<number>;
    } = {}
  ): Promise<any[]> {
    const { includeUser = true, viewedStoryIds = new Set() } = options;

    // Transform all stories in parallel
    const transformedStories = await Promise.all(
      stories.map(story =>
        this.transform(story, {
          includeUser,
          isViewed: viewedStoryIds.has(story.id),
        })
      )
    );

    return transformedStories;
  }

  /**
   * Transform stories grouped by user (for feed)
   * @param storiesByUser - Map of userId -> stories array
   * @param options - Transformation options
   */
  static async transformGroupedByUser(
    storiesByUser: Map<number, any[]>,
    options: {
      viewedStoryIds?: Set<number>;
      recentViewersMap?: Map<number, any[]>;
    } = {}
  ): Promise<any[]> {
    const { viewedStoryIds = new Set(), recentViewersMap = new Map() } = options;

    const transformed = await Promise.all(
      Array.from(storiesByUser.entries()).map(async ([userId, userStories]) => {
        const firstStory = userStories[0];

        // Transform user
        const user = await UserResource.minimal(firstStory.user);

        // Filter out mock stories (stories without id field)
        const actualStories = userStories.filter(s => s.id !== undefined);

        // Transform stories for this user (only if there are actual stories)
        const stories =
          actualStories.length > 0
            ? await Promise.all(
                actualStories.map(async story => {
                  const recentViewers = recentViewersMap.get(story.id) || [];
                  return this.transform(story, {
                    includeUser: false,
                    isViewed: viewedStoryIds.has(story.id),
                    recentViewers,
                  });
                })
              )
            : [];

        // Check if user has unviewed stories
        const hasUnviewed = actualStories.some(s => !viewedStoryIds.has(s.id));

        // Flatten user fields at top level (no user wrapper)
        return {
          ...user, // Spread user fields (id, name, userName, profileFile, profession)
          stories,
          hasUnviewed,
        };
      })
    );

    return transformed;
  }
}
