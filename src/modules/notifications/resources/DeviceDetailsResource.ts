/**
 * Device Details Resource
 * Transforms device details data for API responses
 */

export class DeviceDetailsResource {
  /**
   * Transform a single device details
   */
  static transform(device: any): any {
    // Convert device type string to number for API response
    let deviceTypeNumber = 3; // default to web
    if (device.deviceType === 'ios') {
      deviceTypeNumber = 1;
    } else if (device.deviceType === 'android') {
      deviceTypeNumber = 2;
    } else if (device.deviceType === 'web') {
      deviceTypeNumber = 3;
    }

    return {
      id: device.id,
      uuid: device.uuid,
      deviceType: deviceTypeNumber,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      isActive: device.isActive,
      lastUsedAt: device.lastUsedAt ? device.lastUsedAt.toISOString() : null,
      createdAt: device.createdAt ? device.createdAt.toISOString() : null,
      updatedAt: device.updatedAt ? device.updatedAt.toISOString() : null,
      // Note: fcmToken is NOT included in response for security
    };
  }

  /**
   * Transform a collection of device details
   */
  static collection(devices: any[]): any[] {
    const result = [];
    for (let i = 0; i < devices.length; i++) {
      result.push(this.transform(devices[i]));
    }
    return result;
  }
}
