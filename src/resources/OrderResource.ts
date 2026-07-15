import { BaseResource } from './BaseResource';
import { ORDER_STATE_LABELS } from '../constants/order.constants';

export interface OrderData {
  id: number;
  userId: number;
  sellerId: number;
  postId: number;
  orderNumber: string;
  stateId: number;
  totalAmount: number | string;
  subtotal: number | string;
  platformFee: number | string;
  platformFeePercentage: number | string;
  tax: number | string;
  shipping: number | string;
  discount: number | string;
  paymentMethod: string;
  paymentStatus: string;
  transactionId: string;
  refundTransactionId?: string | null;
  shippingAddress?: any;
  productName: string;
  productPrice: number | string;
  productMetadata?: any;
  rejectionReason?: string | null;
  rejectedAt?: Date | null;
  acceptedAt?: Date | null;
  refundedAt?: Date | null;
  shippingTrackingNumber?: string | null;
  shippingCarrier?: string | null;
  shippedAt?: Date | null;
  estimatedDelivery?: Date | null;
  deliveredAt?: Date | null;
  notes?: string | null;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date | null;
}

export class OrderResource extends BaseResource {
  private order: OrderData;

  constructor(order: OrderData) {
    super();
    this.order = order;
  }

  toJSON() {
    // Parse shippingAddress if it's a string (JSON field from database)
    let shippingAddress = this.order.shippingAddress;
    if (typeof shippingAddress === 'string') {
      try {
        shippingAddress = JSON.parse(shippingAddress);
      } catch (e) {
        shippingAddress = this.order.shippingAddress;
      }
    }

    // Remove id and userId from shippingAddress snapshot (it's just a snapshot, not a reference)
    if (shippingAddress && typeof shippingAddress === 'object') {
      const { id, userId, ...addressWithoutIds } = shippingAddress;
      shippingAddress = addressWithoutIds;
    }

    // Parse productMetadata if it's a string
    let productMetadata = this.order.productMetadata;
    if (typeof productMetadata === 'string') {
      try {
        productMetadata = JSON.parse(productMetadata);
      } catch (e) {
        productMetadata = this.order.productMetadata || {};
      }
    }

    return {
      id: this.order.id,
      orderNumber: this.order.orderNumber,
      userId: this.order.userId,
      sellerId: this.order.sellerId,
      postId: this.order.postId,
      stateId: this.order.stateId,
      state: ORDER_STATE_LABELS[this.order.stateId as keyof typeof ORDER_STATE_LABELS] || 'UNKNOWN',
      totalAmount: Number(this.order.totalAmount),
      subtotal: Number(this.order.subtotal),
      platformFee: Number(this.order.platformFee),
      platformFeePercentage: Number(this.order.platformFeePercentage),
      tax: Number(this.order.tax),
      shipping: Number(this.order.shipping),
      discount: Number(this.order.discount),
      paymentMethod: this.order.paymentMethod,
      paymentStatus: this.order.paymentStatus,
      transactionId: this.order.transactionId,
      refundTransactionId: this.order.refundTransactionId,
      shippingAddress: shippingAddress,
      productName: this.order.productName,
      productPrice: Number(this.order.productPrice),
      productMetadata: productMetadata || {},
      rejectionReason: this.order.rejectionReason,
      rejectedAt: this.order.rejectedAt,
      acceptedAt: this.order.acceptedAt,
      refundedAt: this.order.refundedAt,
      shippingTrackingNumber: this.order.shippingTrackingNumber,
      shippingCarrier: this.order.shippingCarrier,
      shippedAt: this.order.shippedAt,
      deliveredAt: this.order.deliveredAt,
      notes: this.order.notes,
      metadata: this.order.metadata || {},
      createdAt: this.order.createdAt,
      updatedAt: this.order.updatedAt,
      confirmedAt: this.order.confirmedAt,
    };
  }

  /**
   * Static method to transform a single order
   */
  static transform(order: any) {
    // Parse shippingAddress if it's a string (JSON field from database)
    let shippingAddress = order.shippingAddress;
    if (typeof shippingAddress === 'string') {
      try {
        shippingAddress = JSON.parse(shippingAddress);
      } catch (e) {
        // If parsing fails, keep original value
        shippingAddress = order.shippingAddress;
      }
    }

    // Remove id and userId from shippingAddress snapshot (it's just a snapshot, not a reference)
    if (shippingAddress && typeof shippingAddress === 'object') {
      const { id, userId, ...addressWithoutIds } = shippingAddress;
      shippingAddress = addressWithoutIds;
    }

    // Parse productMetadata if it's a string
    let productMetadata = order.productMetadata;
    if (typeof productMetadata === 'string') {
      try {
        productMetadata = JSON.parse(productMetadata);
      } catch (e) {
        productMetadata = order.productMetadata || {};
      }
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      sellerId: order.sellerId,
      postId: order.postId,
      stateId: order.stateId,
      state: ORDER_STATE_LABELS[order.stateId as keyof typeof ORDER_STATE_LABELS] || 'UNKNOWN',
      totalAmount: Number(order.totalAmount),
      subtotal: Number(order.subtotal),
      platformFee: Number(order.platformFee),
      platformFeePercentage: Number(order.platformFeePercentage),
      tax: Number(order.tax),
      shipping: Number(order.shipping),
      discount: Number(order.discount),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      refundTransactionId: order.refundTransactionId,
      shippingAddress: shippingAddress,
      productName: order.productName,
      productPrice: Number(order.productPrice),
      productMetadata: productMetadata || {},
      rejectionReason: order.rejectionReason,
      rejectedAt: order.rejectedAt,
      acceptedAt: order.acceptedAt,
      refundedAt: order.refundedAt,
      shippingTrackingNumber: order.shippingTrackingNumber,
      shippingCarrier: order.shippingCarrier,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      notes: order.notes,
      metadata: order.metadata || {},
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      confirmedAt: order.confirmedAt,
    };
  }

  /**
   * Static method to transform a collection of orders
   */
  static collection(orders: any[]) {
    return orders.map(order => OrderResource.transform(order));
  }
}
