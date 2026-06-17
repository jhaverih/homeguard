export enum ServiceRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  VENDOR_EN_ROUTE = 'VENDOR_EN_ROUTE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ServiceType {
  SCHEDULED_INSPECTION = 'SCHEDULED_INSPECTION',
  ADDITIONAL_SERVICE = 'ADDITIONAL_SERVICE',
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  vendorId?: string;
  subscriptionId: string;
  type: ServiceType;
  status: ServiceRequestStatus;
  preferredDate: string;
  scheduledDate?: string;
  completedAt?: string;
  customerNotes?: string;
  vendorNotes?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalService {
  id: string;
  serviceRequestId: string;
  name: string;
  description: string;
  price: number;
  approved: boolean;
  approvedAt?: string;
}

export interface InspectionNote {
  id: string;
  serviceRequestId: string;
  vendorId: string;
  title: string;
  content: string;
  photoUrls: string[];
  createdAt: string;
}
