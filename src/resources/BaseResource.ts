export abstract class BaseResource {
  /**
   * Transform the resource into a JSON object
   */
  abstract toJSON(): any;

  /**
   * Transform a collection of resources
   */
  static collection<T extends BaseResource>(resources: T[]): any[] {
    return resources.map(resource => resource.toJSON());
  }

  /**
   * Transform a single resource with additional metadata
   */
  static single<T extends BaseResource>(resource: T, meta?: any): any {
    const data = resource.toJSON();
    if (meta) {
      return { ...data, meta };
    }
    return data;
  }
}
