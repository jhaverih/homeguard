import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.29/api';

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
};

export const userApi = {
  getMe: () => api.get('/users/me'),
  switchRole: (role: string) => api.patch('/users/me/role', { role }),
  updatePushToken: (token: string) => api.patch('/users/me/push-token', { token }),
};

export const teamApi = {
  getMembers: () => api.get('/users/me/team'),
  addMember: (email: string) => api.post('/users/me/team', { email }),
  removeMember: (memberId: string) => api.delete(`/users/me/team/${memberId}`),
};

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMySubscription: () => api.get('/subscriptions/my'),
  subscribe: (planId: string): Promise<{ clientSecret: string; subscriptionId?: string }> =>
    api.post(`/subscriptions/subscribe/${planId}`) as any,
  cancelSubscription: () => api.post('/subscriptions/cancel'),
  changePlan: (planId: string) => api.post(`/subscriptions/change/${planId}`),
};

export const requestsApi = {
  create: (data: any) => api.post('/service-requests', data),
  getMyRequests: () => api.get('/service-requests/my'),
  getVendorJobs: () => api.get('/service-requests/vendor/my'),
  getPending: () => api.get('/service-requests/pending'),
  getOne: (id: string) => api.get(`/service-requests/${id}`),
  getOneWithPhotos: (id: string) => api.get(`/service-requests/${id}/with-photos`),
  accept: (id: string, scheduledDate: string) => api.post(`/service-requests/${id}/accept`, { scheduledDate }),
  updateStatus: (id: string, status: string, completionPhotoKeys?: string[]) =>
    api.patch(`/service-requests/${id}/status`, { status, ...(completionPhotoKeys ? { completionPhotoKeys } : {}) }),
  addNotes: (id: string, notes: string) => api.patch(`/service-requests/${id}/notes`, { notes }),
  recommendService: (id: string, data: any) => api.post(`/service-requests/${id}/additional-services`, data),
  approveService: (serviceId: string) => api.post(`/service-requests/additional-services/${serviceId}/approve`),
  getPendingAdditionalServices: () => api.get('/service-requests/additional-services/pending'),
  reschedule: (id: string, newDate: string) => api.patch(`/service-requests/${id}/reschedule`, { newDate }),
  cancel: (id: string) => api.patch(`/service-requests/${id}/cancel`),
};

export const inspectionsApi = {
  addNote: (requestId: string, data: any) => api.post(`/inspections/requests/${requestId}/notes`, data),
  getNotes: (requestId: string) => api.get(`/inspections/requests/${requestId}/notes`),
  getHistory: () => api.get('/inspections/history'),
};

export const pricingApi = {
  getAll: () => api.get('/pricing'),
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

export const maintenanceBotApi = {
  chat: (message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    aiApi.post('/maintenance-bot/chat', { message, history }),
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
  getPending: (): Promise<any[]> => api.get('/payments/pending') as any,
  authorize: (paymentId: string) => api.patch(`/payments/${paymentId}/authorize`, {}),
  getVendorHistory: (): Promise<any[]> => api.get('/payments/vendor/history') as any,
  getHistory: () => api.get('/payments/history'),
};
