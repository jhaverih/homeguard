export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface Payment {
  id: string;
  serviceRequestId: string;
  customerId: string;
  vendorId: string;
  amount: number;
  platformFee: number;
  vendorAmount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  createdAt: string;
}

export interface ServicePrice {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  isActive: boolean;
}
