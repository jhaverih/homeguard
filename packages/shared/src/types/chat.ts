export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  attachmentUrl?: string;
  readAt?: string;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  serviceRequestId: string;
  customerId: string;
  vendorId: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
}

export enum NotificationType {
  REQUEST_ACCEPTED = 'REQUEST_ACCEPTED',
  VENDOR_EN_ROUTE = 'VENDOR_EN_ROUTE',
  VENDOR_ARRIVED = 'VENDOR_ARRIVED',
  JOB_COMPLETED = 'JOB_COMPLETED',
  ADDITIONAL_SERVICE_RECOMMENDED = 'ADDITIONAL_SERVICE_RECOMMENDED',
  ADDITIONAL_SERVICE_APPROVED = 'ADDITIONAL_SERVICE_APPROVED',
  SCHEDULE_CHANGED = 'SCHEDULE_CHANGED',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  NEW_MESSAGE = 'NEW_MESSAGE',
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}
