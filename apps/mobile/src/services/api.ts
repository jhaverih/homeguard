import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.29/api';

// The admin app serves static legal docs at its root domain (same host, no /api prefix).
export const TERMS_URL = `${API_URL.replace(/\/api\/?$/, '')}/legal/customer-terms.html`;
export const VENDOR_TERMS_URL = `${API_URL.replace(/\/api\/?$/, '')}/legal/vendor-terms.html`;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// In-memory token mirror so the interceptor doesn't depend on SecureStore
// being readable in the same tick it was written — avoids a race on first
// dashboard load immediately after registration/login.
let _token: string | null = null;
export const setMemoryToken = (t: string | null) => { _token = t; };

api.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    const token = _token ?? await SecureStore.getItemAsync('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (!err.response) {
      // No response = network error (wrong WiFi, server down, timeout)
      return Promise.reject(new Error('NETWORK_ERROR'));
    }
    const raw = err.response?.data?.message;
    const message = Array.isArray(raw) ? raw[0] : (raw || 'Something went wrong');
    return Promise.reject(new Error(message));
  },
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
  verifyEmail: (email: string, code: string) =>
    api.post('/auth/verify-email', { email, code }),
  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),
  // Explicit token param — called from the registration wizard's verify
  // step, before setAuth() has committed the session to the memory/
  // SecureStore token the interceptor normally reads.
  updatePendingEmail: (email: string, token: string) =>
    api.patch('/auth/pending-email', { email }, { headers: { Authorization: `Bearer ${token}` } }),
};

export const userApi = {
  getMe: () => api.get('/users/me'),
  switchRole: (role: string) => api.patch('/users/me/role', { role }),
  updatePushToken: (token: string) => api.patch('/users/me/push-token', { token }),
  clearPushToken: () => api.delete('/users/me/push-token'),
  acceptTerms: (termsType: 'CUSTOMER' | 'VENDOR') => api.patch('/users/me/accept-terms', { termsType }),
};

export const teamApi = {
  getMembers: () => api.get('/users/me/team'),
  addMember: (email: string) => api.post('/users/me/team', { email }),
  removeMember: (memberId: string) => api.delete(`/users/me/team/${memberId}`),
};

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMySubscription: () => api.get('/subscriptions/my'),
  subscribe: (planId: string, acceptedTerms?: boolean): Promise<{ clientSecret: string; subscriptionId?: string }> =>
    api.post(`/subscriptions/subscribe/${planId}`, { acceptedTerms }) as any,
  cancelSubscription: () => api.post('/subscriptions/cancel'),
  changePlan: (planId: string) => api.post(`/subscriptions/change/${planId}`),
  // Swaps a live CarePlus subscription onto whatever Stripe Price its current
  // home characteristics now resolve to — call after saving/editing characteristics.
  reprice: (): Promise<{ ok: boolean }> => api.post('/subscriptions/reprice') as any,
};

export type PropertyCharacteristics = {
  squareFootage: number;
  hvacCount: number;
  waterHeaterCount: number;
  bathroomCount: number;
  kitchenCount: number;
  hasDetachedGarage: boolean;
};

export const propertyCharacteristicsApi = {
  getMine: (): Promise<PropertyCharacteristics | null> => api.get('/property-characteristics/me') as any,
  upsertMine: (data: PropertyCharacteristics): Promise<PropertyCharacteristics> => api.put('/property-characteristics/me', data) as any,
  // Pure computation, no persistence — lets the UI show a live surcharge
  // breakdown as the customer fills in the form, before saving.
  quote: (data: PropertyCharacteristics): Promise<{
    carePlusSurcharge: number; assessmentCustomerSurcharge: number; assessmentVendorCost: number;
  }> => api.post('/property-characteristics/quote', data) as any,
};

export const cancellationFeedbackApi = {
  submit: (data: {
    type: 'SUBSCRIPTION' | 'SERVICE_REQUEST';
    subscriptionId?: string;
    serviceRequestId?: string;
    reasonCode: string;
    comment?: string;
  }) => api.post('/cancellation-feedback', data),
};

export const requestsApi = {
  create: (data: any) => api.post('/service-requests', data),
  getMyRequests: () => api.get('/service-requests/my'),
  getInspectionsRemaining: () => api.get('/service-requests/inspections-remaining'),
  getVendorJobs: () => api.get('/service-requests/vendor/my'),
  getPending: () => api.get('/service-requests/pending'),
  getRejected: () => api.get('/service-requests/rejected'),
  reject: (id: string) => api.post(`/service-requests/${id}/reject`),
  getOne: (id: string) => api.get(`/service-requests/${id}`),
  getOneWithPhotos: (id: string) => api.get(`/service-requests/${id}/with-photos`),
  accept: (id: string, scheduledDate: string, notes?: string) => api.post(`/service-requests/${id}/accept`, { scheduledDate, ...(notes ? { notes } : {}) }),
  acceptGroup: (bookingGroupId: string, scheduledDate: string, notes?: string) =>
    api.post(`/service-requests/group/${bookingGroupId}/accept`, { scheduledDate, ...(notes ? { notes } : {}) }),
  acceptBundle: (requestIds: string[], scheduledDate: string, notes?: string) =>
    api.post('/service-requests/bundle/accept', { requestIds, scheduledDate, ...(notes ? { notes } : {}) }),
  updateBundleStatus: (bookingGroupId: string, status: string) =>
    api.patch(`/service-requests/bundle/${bookingGroupId}/status`, { status }),
  completeBundle: (items: { serviceRequestId: string; completionPhotoKeys: string[]; finalQuantities?: Record<string, number> }[]) =>
    api.post('/service-requests/bundle/complete', { items }),
  updateStatus: (id: string, status: string, completionPhotoKeys?: string[], finalQuantities?: Record<string, number>) =>
    api.patch(`/service-requests/${id}/status`, {
      status,
      ...(completionPhotoKeys ? { completionPhotoKeys } : {}),
      ...(finalQuantities && Object.keys(finalQuantities).length > 0 ? { finalQuantities } : {}),
    }),
  addNotes: (id: string, notes: string) => api.patch(`/service-requests/${id}/notes`, { notes }),
  recommendService: (id: string, data: any) => api.post(`/service-requests/${id}/additional-services`, data),
  addMaterial: (id: string, data: { description: string; cost: number }) => api.post(`/service-requests/${id}/materials`, data),
  approveService: (serviceId: string) => api.post(`/service-requests/additional-services/${serviceId}/approve`),
  declineService: (serviceId: string) => api.delete(`/service-requests/additional-services/${serviceId}/decline`),
  getPendingAdditionalServices: () => api.get('/service-requests/additional-services/pending'),
  reschedule: (id: string, newDate: string) => api.patch(`/service-requests/${id}/reschedule`, { newDate }),
  cancel: (id: string) => api.patch(`/service-requests/${id}/cancel`),
  confirmSchedule: (id: string) => api.patch(`/service-requests/${id}/confirm-schedule`),
  declineSchedule: (id: string) => api.patch(`/service-requests/${id}/decline-schedule`),
  updateLocation: (id: string, latitude: number, longitude: number, heading?: number | null) =>
    api.patch(`/service-requests/${id}/location`, { latitude, longitude, heading: heading ?? undefined }),
  vendorRelease: (id: string) => api.patch(`/service-requests/${id}/vendor-release`),
  getSolarQuote: (id: string) => api.get(`/service-requests/${id}/solar-quote`),
  submitSolarQuote: (id: string, data: any) => api.post(`/service-requests/${id}/solar-quote`, data),
  getSolarConsultation: (id: string) => api.get(`/service-requests/${id}/solar-consultation`),
  requestConsultation: (id: string, preferredDate: string) => api.post(`/service-requests/${id}/solar-consultation`, { preferredDate }),
  updateConsultation: (id: string, action: string, proposedDate?: string) => api.patch(`/service-requests/${id}/solar-consultation`, { action, proposedDate }),
};

export const inspectionsApi = {
  addNote: (requestId: string, data: any) => api.post(`/inspections/requests/${requestId}/notes`, data),
  getNotes: (requestId: string) => api.get(`/inspections/requests/${requestId}/notes`),
  getHistory: () => api.get('/inspections/history'),
  getChecklist: (serviceRequestId: string) => api.get(`/inspections/checklist/${serviceRequestId}`),
  upsertTask: (requestId: string, taskKey: string, dto: any) =>
    api.put(`/inspections/requests/${requestId}/tasks/${taskKey}`, dto),
  getTasks: (requestId: string) => api.get(`/inspections/requests/${requestId}/tasks`),
  getProgress: (requestId: string) => api.get(`/inspections/requests/${requestId}/progress`),
  getCustomerTaskHistory: () => api.get('/inspections/customer/task-history'),
  getPropertyAcProfilePrefill: (requestId: string): Promise<Record<string, any> | null> =>
    api.get(`/inspections/requests/${requestId}/property-ac-profile-prefill`) as any,
};

export const pricingApi = {
  getAll: () => api.get('/pricing'),
  // Which requiredCapabilityId values have a vendor near the customer who
  // can actually perform them — not a filtered catalog, see the backend
  // controller for why. `{ all: true }` means don't filter anything.
  getAvailability: () => api.get('/pricing/availability'),
  notifyMe: (servicePriceId: string) => api.post(`/pricing/${servicePriceId}/notify-me`),
};

export const marketplaceApi = {
  getConfig: (): Promise<{
    plans: any[]; roomUnits: any[]; conditions: any[]; addOns: any[]; frequencyDiscounts: any[];
  }> => api.get('/marketplace/house-cleaning/config') as any,
  quote: (body: any): Promise<{ perVisitCost: number; monthlyPrice: number | null; quoteRequired: boolean }> =>
    api.post('/marketplace/house-cleaning/quote', body) as any,
  subscribe: (body: any): Promise<{ subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null }> =>
    api.post('/marketplace/house-cleaning/subscribe', body) as any,
  bookOneTime: (body: any) => api.post('/marketplace/house-cleaning/one-time', body),
  getHouseCleaningPropertyProfile: (): Promise<{ roomConfig: Record<string, number> } | null> =>
    api.get('/marketplace/house-cleaning/property-profile') as any,
  getLawncareConfig: (): Promise<{ services: any[]; packages: any[]; propertyDetailFields: any[] }> =>
    api.get('/marketplace/lawncare/config') as any,
  quoteLawncare: (body: any): Promise<
    { type: 'package'; monthlyPrice: number; requiresQuote: boolean }
    | { type: 'service'; price: number; discountRate: number; requiresQuote: boolean; monthlyPrice?: number }
  > => api.post('/marketplace/lawncare/quote', body) as any,
  subscribeLawncarePackage: (body: any): Promise<{ subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null }> =>
    api.post('/marketplace/lawncare/subscribe', body) as any,
  subscribeLawncareService: (body: any): Promise<{ subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null }> =>
    api.post('/marketplace/lawncare/service-subscribe', body) as any,
  bookLawncareService: (body: any) => api.post('/marketplace/lawncare/book', body),
  getLawncarePropertyProfile: (): Promise<any | null> => api.get('/marketplace/lawncare/property-profile') as any,
  saveLawncarePropertyProfile: (body: any) => api.put('/marketplace/lawncare/property-profile', body),
  getPestConfig: (): Promise<{ services: any[]; packages: any[] }> =>
    api.get('/marketplace/pest/config') as any,
  quotePest: (body: any): Promise<
    { type: 'package'; monthlyPrice: number } | { type: 'service'; price: number; discountRate: number; comped: boolean }
  > => api.post('/marketplace/pest/quote', body) as any,
  subscribePestPackage: (body: any): Promise<{ subscriptionId: string; monthlyPrice: number; charged: boolean; clientSecret: string | null }> =>
    api.post('/marketplace/pest/subscribe', body) as any,
  bookPestService: (body: any) => api.post('/marketplace/pest/book', body),
  getPestPropertyProfile: (): Promise<any | null> => api.get('/marketplace/pest/property-profile') as any,
  savePestPropertyProfile: (body: any) => api.put('/marketplace/pest/property-profile', body),
};

export const standaloneServiceApi = {
  create: (body: any) => api.post('/service-requests/standalone', body),
};

export const reviewsApi = {
  submit: (body: { serviceRequestId: string; rating: number; comment?: string }) => api.post('/reviews', body),
  getMyReview: (serviceRequestId: string) => api.get(`/reviews/my/${serviceRequestId}`),
};

export const alertsApi = {
  getMyAlerts: (page = 1, limit = 20) => api.get(`/alerts?page=${page}&limit=${limit}`),
  markRead: (id: string) => api.patch(`/alerts/${id}/read`),
  markAllRead: () => api.patch('/alerts/read-all'),
  requestDispatch: (id: string) => api.post(`/alerts/${id}/dispatch`),
};

export type MonitoringDevice = {
  id: string;
  deviceType: string;
  name: string;
  isStreaming: boolean;
  lastReportedAt: string | null;
  reading: string | null;
};

export const yolinkApi = {
  getMyHomes: () => api.get('/yolink/my-homes'),
  linkHome: (body: { customerId: string; yolinkUAID: string; yolinkSecretKey: string; homeName: string; address?: string }): Promise<{ home: any; devices: any[] }> =>
    api.post('/yolink/link', body) as any,
  getDevices: (): Promise<MonitoringDevice[]> => api.get('/yolink/devices') as any,
};

export type HvacFinding = {
  id: string;
  ruleId: string;
  eventType: string;
  severity: 'INFO' | 'WATCH' | 'ATTENTION' | 'HIGH_ATTENTION' | 'CRITICAL';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  message: string;
  measurements: Record<string, any> | null;
  reasonCodes: string[];
  recommendedActions: string[];
  detectedAt: string;
};

export type HvacSensorCoverage = { role: string; label: string; connected: boolean; deviceNames: string[] };

export type HvacAnalytics = {
  tier: string;
  isProactivePlus: boolean;
  healthState: 'NOT_INCLUDED' | 'AWAITING_SENSORS' | 'LEARNING';
  findings: HvacFinding[];
  sensorCoverage: HvacSensorCoverage[];
};

export const hvacAnalyticsApi = {
  getMine: (): Promise<HvacAnalytics> => api.get('/hvac-analytics/me') as any,
  resolveFinding: (id: string) => api.post(`/hvac-analytics/findings/${id}/resolve`),
  dismissFinding: (id: string) => api.post(`/hvac-analytics/findings/${id}/dismiss`),
  requestContractorVisit: () => api.post('/hvac-analytics/request-contractor-visit'),
};

export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
};

// Separate client for AI assistant — Ollama inference can take 3+ minutes on low-end hardware
const aiApi = axios.create({ baseURL: API_URL, timeout: 600000 });
aiApi.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    const token = _token ?? await SecureStore.getItemAsync('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
aiApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (!err.response) return Promise.reject(new Error('NETWORK_ERROR'));
    const raw = err.response?.data?.message;
    const message = Array.isArray(raw) ? raw[0] : (raw || 'Something went wrong');
    return Promise.reject(new Error(message));
  },
);

export type ServiceRequestDraft = {
  prefilledNotes?: string;
  preselectServicePriceId?: string;
  preferredDate?: string;
};

export type ChatResponse = {
  reply: string;
  sessionId: string;
  recommendations: any[];
  serviceRequestDraft?: ServiceRequestDraft;
  inspectionReportLink?: { serviceRequestId: string };
};

export type SeasonalTip = { text: string; orderable: boolean };

export const maintenanceBotApi = {
  chat: (message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, sessionId?: string | null): Promise<ChatResponse> =>
    aiApi.post('/maintenance-bot/chat', { message, history, ...(sessionId ? { sessionId } : {}) }) as any,
  getSessions: (): Promise<any[]> => api.get('/maintenance-bot/sessions') as any,
  getSession: (id: string): Promise<any> => api.get(`/maintenance-bot/sessions/${id}`) as any,
  deleteSession: (id: string) => api.delete(`/maintenance-bot/sessions/${id}`),
  respondToRecommendation: (id: string, status: 'ACCEPTED' | 'DECLINED') =>
    api.patch(`/maintenance-bot/recommendations/${id}`, { status }),
  getSeasonalTips: (): Promise<{ season: string; tips: SeasonalTip[]; annualTips: SeasonalTip[] }> =>
    api.get('/maintenance-bot/seasonal-tips') as any,
};

export const uploadsApi = {
  uploadPhoto: async (uri: string, folder: string): Promise<{ key: string; url: string }> => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
    return api.post(`/uploads?folder=${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    }) as any;
  },
  // Sibling to uploadPhoto — takes an explicit mime type/filename so callers can
  // upload PDFs (or any file) instead of always sending image/jpeg. `token` lets
  // callers authenticate before the auth store's interceptor token is set yet,
  // e.g. right after register() returns an accessToken but before email verification.
  uploadDocument: async (
    uri: string, folder: string, mimeType: string, filename: string, token?: string,
  ): Promise<{ key: string; url: string }> => {
    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: filename } as any);
    return api.post(`/uploads?folder=${folder}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 30000,
    }) as any;
  },
};

export const vendorApi = {
  getCapabilities: (): Promise<any[]> => api.get('/vendor/capabilities') as any,
  getMyCapabilities: (): Promise<any[]> => api.get('/vendor/me/capabilities') as any,
  setMyCapabilities: (capabilityIds: string[]) => api.patch('/vendor/me/capabilities', { capabilityIds }),
  acknowledgeCapability: (capabilityId: string) => api.post(`/vendor/me/capabilities/${capabilityId}/acknowledge`),
  getMyCertifications: (): Promise<any[]> => api.get('/vendor/me/certifications') as any,
  submitCertification: (data: {
    certificationType: string; licenseNumber: string; issuingState?: string; expirationDate: string; documentKey: string;
  }, token?: string) => api.post('/vendor/me/certifications', data, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined),
  updateCertification: (id: string, data: {
    certificationType?: string; licenseNumber?: string; issuingState?: string; expirationDate?: string; documentKey?: string;
  }) => api.patch(`/vendor/me/certifications/${id}`, data),
  getApplication: (): Promise<any> => api.get('/vendor/application') as any,
  submitApplication: (data: {
    ein?: string; stateRegistrationDocKey?: string;
    coiDocumentKey?: string; coiExpirationDate?: string;
  }) => api.post('/vendor/application', data),
};

export const disputesApi = {
  open: (data: {
    serviceRequestId: string;
    vendorId: string;
    stripePaymentIntentId?: string;
    category: string;
    description: string;
    photoKeys?: string[];
  }) => api.post('/disputes', data),
  getMy: () => api.get('/disputes/my'),
};

export const paymentsApi = {
  getOnboardingLink: () => api.post('/payments/vendor/onboarding'),
  getVendorStripeStatus: (): Promise<{ connected: boolean; onboardingComplete: boolean }> =>
    api.get('/payments/vendor/stripe-status') as any,
  getPending: (): Promise<any[]> => api.get('/payments/pending') as any,
  authorize: (paymentId: string): Promise<{ clientSecret?: string }> =>
    api.patch(`/payments/${paymentId}/authorize`, {}) as any,
  createServicePayment: (serviceId: string): Promise<{ clientSecret?: string; paymentId?: string }> =>
    api.post(`/payments/service/${serviceId}`) as any,
  getVendorHistory: (): Promise<any[]> => api.get('/payments/vendor/history') as any,
  getHistory: (): Promise<any[]> => api.get('/payments/history') as any,
  createSetupIntent: (): Promise<{ setupIntentClientSecret: string; ephemeralKeySecret: string; customerId: string }> =>
    api.post('/payments/setup-intent') as any,
  listMethods: (): Promise<{ id: string; brand: string; last4: string; isDefault: boolean }[]> =>
    api.get('/payments/methods') as any,
  setDefaultMethod: (id: string): Promise<{ success: boolean }> =>
    api.patch(`/payments/methods/${id}/default`, {}) as any,
  removeMethod: (id: string): Promise<{ success: boolean }> =>
    api.delete(`/payments/methods/${id}`) as any,
};
