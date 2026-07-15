/**
 * Notification Resource
 * Transforms notification data for API responses
 */

// Note: UserResource import may need adjustment based on your project structure
// import { UserResource } from '../../../resources/UserResource';

export class NotificationResource {
  /**
   * Transform a single notification
   */
  static async transform(notification: any): Promise<any> {
    let sender = null;
    if (notification.sender) {
      sender = {
        id: notification.sender.id,
        name: notification.sender.name,
        userName: notification.sender.userName,
        profileFile: notification.sender.profileFile,
        profileFileStorage: notification.sender.profileFileStorage,
      };
    }

    // Convert type string to number
    let typeNumber = 1; // default
    if (notification.type === 'message') {
      typeNumber = 1;
    } else if (notification.type === 'message_request') {
      typeNumber = 2;
    } else if (notification.type === 'reaction') {
      typeNumber = 3;
    } else if (notification.type === 'group_invite') {
      typeNumber = 4;
    } else if (notification.type === 'group_update') {
      typeNumber = 5;
    } else if (notification.type === 'incoming_call') {
      typeNumber = 6;
    } else if (notification.type === 'missed_call') {
      typeNumber = 7;
    }

    // Build result object
    const result: any = {
      id: notification.id,
      uuid: notification.uuid,
      type: typeNumber,
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      isRead: notification.isRead,
      sender: sender,
    };

    // Handle dates
    if (notification.readAt) {
      result.readAt = notification.readAt.toISOString();
    } else {
      result.readAt = null;
    }

    if (notification.createdAt) {
      result.createdAt = notification.createdAt.toISOString();
    } else {
      result.createdAt = notification.createdAt;
    }

    if (notification.updatedAt) {
      result.updatedAt = notification.updatedAt.toISOString();
    } else {
      result.updatedAt = notification.updatedAt;
    }

    return result;
  }

  /**
   * Transform a collection of notifications
   */
  static async collection(notifications: any[]): Promise<any[]> {
    const result = [];
    for (let i = 0; i < notifications.length; i++) {
      const transformed = await this.transform(notifications[i]);
      result.push(transformed);
    }
    return result;
  }
}
