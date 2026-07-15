import { BaseResource } from './BaseResource';

export interface AddressData {
  id: number;
  userId: number;
  label?: string | null;
  fullName: string;
  phone: string;
  countryCode?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export class AddressResource extends BaseResource {
  private address: AddressData;

  constructor(address: AddressData) {
    super();
    this.address = address;
  }

  toJSON() {
    return {
      id: this.address.id,
      userId: this.address.userId,
      label: this.address.label,
      fullName: this.address.fullName,
      phone: this.address.phone,
      countryCode: this.address.countryCode,
      addressLine1: this.address.addressLine1,
      addressLine2: this.address.addressLine2,
      city: this.address.city,
      state: this.address.state,
      postalCode: this.address.postalCode,
      country: this.address.country,
      isDefault: this.address.isDefault,
      createdAt: this.address.createdAt,
      updatedAt: this.address.updatedAt,
    };
  }

  /**
   * Static method to transform a single address
   */
  static transform(address: any) {
    return {
      id: address.id,
      userId: address.userId,
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      countryCode: address.countryCode,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }

  /**
   * Static method to transform a collection of addresses
   */
  static collection(addresses: any[]) {
    return addresses.map(address => AddressResource.transform(address));
  }
}
