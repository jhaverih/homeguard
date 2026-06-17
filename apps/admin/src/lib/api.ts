import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

export const api = axios.create({ baseURL: API_URL });

export const pricingApi = {
  getAll: () => api.get('/pricing').then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/pricing/${id}`, data).then((r) => r.data),
  create: (data: any) => api.post('/pricing', data).then((r) => r.data),
};

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans').then((r) => r.data),
  updatePlan: (id: string, data: any) => api.patch(`/subscriptions/plans/${id}`, data).then((r) => r.data),
};
