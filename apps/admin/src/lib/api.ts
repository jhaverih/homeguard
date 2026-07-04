import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      localStorage.removeItem('admin_token');
      window.location.replace('/login');
    }
    return Promise.reject(err);
  },
);

export const pricingApi = {
  getAll: () => api.get('/pricing').then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/pricing/${id}`, data).then((r) => r.data),
  create: (data: any) => api.post('/pricing', data).then((r) => r.data),
};

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans').then((r) => r.data),
  updatePlan: (id: string, data: any) => api.patch(`/subscriptions/plans/${id}`, data).then((r) => r.data),
};

export const disputesApi = {
  getAll: () => api.get('/disputes').then((r) => r.data),
  resolve: (id: string, resolution: string, note: string) =>
    api.patch(`/disputes/${id}/resolve`, { resolution, note }).then((r) => r.data),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats').then((r) => r.data),
  getCustomers: () => api.get('/admin/customers').then((r) => r.data),
  getVendors: () => api.get('/admin/vendors').then((r) => r.data),
  approveVendor: (id: string) => api.patch(`/admin/vendors/${id}/approve`).then((r) => r.data),
  removeVendor: (id: string) => api.delete(`/admin/vendors/${id}`).then((r) => r.data),
  getSchedule: (year: number, month: number) =>
    api.get(`/admin/schedule?year=${year}&month=${month}`).then((r) => r.data),
};
