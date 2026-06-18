import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

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
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
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
