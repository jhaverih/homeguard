import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.29/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    const token = await SecureStore.getItemAsync('accessToken');
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

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMySubscription: () => api.get('/subscriptions/my'),
  subscribe: (planId: string) => api.post(`/subscriptions/subscribe/${planId}`),
};

export const requestsApi = {
  create: (data: any) => api.post('/service-requests', data),
  getMyRequests: () => api.get('/service-requests/my'),
  getVendorJobs: () => api.get('/service-requests/vendor/my'),
  getPending: () => api.get('/service-requests/pending'),
  getOne: (id: string) => api.get(`/service-requests/${id}`),
  accept: (id: string, scheduledDate: string) => api.post(`/service-requests/${id}/accept`, { scheduledDate }),
  updateStatus: (id: string, status: string) => api.patch(`/service-requests/${id}/status`, { status }),
  addNotes: (id: string, notes: string) => api.patch(`/service-requests/${id}/notes`, { notes }),
  recommendService: (id: string, data: any) => api.post(`/service-requests/${id}/additional-services`, data),
  approveService: (serviceId: string) => api.post(`/service-requests/additional-services/${serviceId}/approve`),
  reschedule: (id: string, newDate: string) => api.patch(`/service-requests/${id}/reschedule`, { newDate }),
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

export const paymentsApi = {
  getOnboardingLink: () => api.post('/payments/vendor/onboarding'),
  createIntent: (data: any) => api.post('/payments/create-intent', data),
  getHistory: () => api.get('/payments/history'),
};
