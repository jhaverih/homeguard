export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SUSPENDED = 'SUSPENDED',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roles: UserRole[];
  status: UserStatus;
  activeRole: UserRole;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorProfile {
  id: string;
  userId: string;
  bio?: string;
  serviceArea?: string;
  rating: number;
  totalJobs: number;
  stripeConnectAccountId?: string;
  stripeOnboardingComplete: boolean;
}

export interface CustomerProfile {
  id: string;
  userId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  homeDetails?: string;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}
