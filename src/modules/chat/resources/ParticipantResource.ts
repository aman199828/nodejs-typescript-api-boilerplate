/**
 * Participant Resource
 * Transforms participant data for API responses
 */

import { getFileUrlWithStorage } from '../../../utils/file.utils';
import { STORAGE_FOLDERS } from '../../../services/storage';
import { UserResource } from '../../../resources/UserResource';
import { getUserStatus } from '../utils/user-status.utils';

export class ParticipantResource {
  /**
   * Transform a single participant
   * @param participant - Participant data
   * @param currentUserId - Current user ID for privacy checks (optional)
   */
  static async transform(participant: any, currentUserId?: number): Promise<any> {
    const profileFile = participant.user?.profileFile
      ? await getFileUrlWithStorage(
          participant.user.profileFile,
          participant.user.profileFileStorage || 'local',
          STORAGE_FOLDERS.PROFILE_FILE
        )
      : null;

    // Get status for participant
    const participantUserId = participant.user?.id || participant.userId;
    const status = await getUserStatus(participantUserId, currentUserId);

    return {
      id: participantUserId,
      name: participant.user?.name,
      userName: participant.user?.userName,
      profileFile,
      role: participant.role,
      isMuted: participant.isMuted,
      unreadCount: participant.unreadCount,
      lastReadAt: participant.lastReadAt,
      lastReadMessageId: participant.lastReadMessageId,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      isOnline: status?.isOnline ?? null,
      lastSeenAt: status?.lastSeenAt?.toISOString() ?? null,
    };
  }

  /**
   * Transform a collection of participants
   * @param participants - Array of participant data
   * @param currentUserId - Current user ID for privacy checks (optional)
   */
  static async collection(participants: any[], currentUserId?: number): Promise<any[]> {
    return Promise.all(participants.map(p => this.transform(p, currentUserId)));
  }
}
