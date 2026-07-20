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
  getAll: () => api.get('/pricing?all=true').then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/pricing/${id}`, data).then((r) => r.data),
  create: (data: any) => api.post('/pricing', data).then((r) => r.data),
  remove: (id: string) => api.delete(`/pricing/${id}`),
  bulkUpdateCategory: (ids: string[], category: string | null) =>
    api.patch('/pricing/bulk/category', { ids, category }).then((r) => r.data),
  listBackups: () => api.get('/pricing/backups').then((r) => r.data),
  downloadBackupCsv: (id: string) => api.get(`/pricing/backups/${id}/csv`, { responseType: 'blob' }),
};

export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans').then((r) => r.data),
  updatePlan: (id: string, data: any) => api.patch(`/subscriptions/plans/${id}`, data).then((r) => r.data),
};

export const marketplaceApi = {
  getConfig: () => api.get('/marketplace/house-cleaning/config').then((r) => r.data),
  updatePlan: (id: string, data: any) => api.patch(`/marketplace/house-cleaning/plans/${id}`, data).then((r) => r.data),
  updateRoomUnit: (id: string, data: any) => api.patch(`/marketplace/house-cleaning/room-units/${id}`, data).then((r) => r.data),
  updateCondition: (id: string, data: any) => api.patch(`/marketplace/house-cleaning/conditions/${id}`, data).then((r) => r.data),
  updateAddOn: (id: string, data: any) => api.patch(`/marketplace/house-cleaning/add-ons/${id}`, data).then((r) => r.data),
  updateFrequencyDiscount: (id: string, data: any) => api.patch(`/marketplace/house-cleaning/frequency-discounts/${id}`, data).then((r) => r.data),
};

export const inspectionConfigApi = {
  getTree: () => api.get('/inspection-config').then((r) => r.data),
  updateSection: (id: string, data: any) => api.patch(`/inspection-config/sections/${id}`, data).then((r) => r.data),
  createSection: (subgroupId: string, label: string) => api.post(`/inspection-config/subgroups/${subgroupId}/sections`, { label }).then((r) => r.data),
  removeSection: (id: string) => api.delete(`/inspection-config/sections/${id}`).then((r) => r.data),
  updateTask: (id: string, data: any) => api.patch(`/inspection-config/tasks/${id}`, data).then((r) => r.data),
  createTask: (sectionId: string, label: string) => api.post(`/inspection-config/sections/${sectionId}/tasks`, { label }).then((r) => r.data),
  removeTask: (id: string) => api.delete(`/inspection-config/tasks/${id}`).then((r) => r.data),
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
  setVendorPlan: (id: string, tier: 'STANDARD' | 'ELITE', expiresAt?: string) =>
    api.patch(`/admin/vendors/${id}/plan`, { tier, expiresAt }).then((r) => r.data),
  removeVendor: (id: string) => api.delete(`/admin/vendors/${id}`).then((r) => r.data),
  getVendorKpi: (id: string) => api.get(`/admin/vendors/${id}/kpi`).then((r) => r.data),
  updateVendorServiceArea: (id: string, data: { address?: string; city?: string; state?: string; baseZipCode?: string; serviceRadiusMiles?: number; serviceCounties?: string[] }) =>
    api.patch(`/admin/vendors/${id}/service-area`, data).then((r) => r.data),
  getCounties: (): Promise<Record<string, { fips: string; name: string }[]>> => api.get('/admin/counties').then((r) => r.data),
  getVendorReviews: (id: string) => api.get(`/reviews/vendor/${id}`).then((r) => r.data),
  getCustomerActivity: (id: string) => api.get(`/admin/customers/${id}/activity`).then((r) => r.data),
  getVendorActivity: (id: string) => api.get(`/admin/vendors/${id}/activity`).then((r) => r.data),
  getSchedule: (year: number, month: number) =>
    api.get(`/admin/schedule?year=${year}&month=${month}`).then((r) => r.data),
  getAlerts: (page = 1, limit = 50) =>
    api.get(`/admin/alerts?page=${page}&limit=${limit}`).then((r) => r.data),
  getTeamUsers: () => api.get('/admin/team-users').then((r) => r.data),
  createTeamUser: (data: { email: string; firstName: string; lastName: string; adminLevel: string }) =>
    api.post('/admin/team-users', data).then((r) => r.data),
  updateTeamUserLevel: (id: string, adminLevel: string) =>
    api.patch(`/admin/team-users/${id}/level`, { adminLevel }).then((r) => r.data),
  removeTeamUser: (id: string) => api.delete(`/admin/team-users/${id}`).then((r) => r.data),
  reinstateTeamUser: (id: string) => api.patch(`/admin/team-users/${id}/reinstate`).then((r) => r.data),
  deleteTeamUserPermanently: (id: string) => api.delete(`/admin/team-users/${id}/permanent`).then((r) => r.data),
  getCapabilities: () => api.get('/admin/capabilities').then((r) => r.data),
  createCapability: (data: { name: string; requiredCertificationType: string }) =>
    api.post('/admin/capabilities', data).then((r) => r.data),
  getVendorApplications: (status?: string) =>
    api.get(`/admin/vendor-applications${status ? `?status=${status}` : ''}`).then((r) => r.data),
  reviewVendorApplication: (id: string, status: string, reviewNotes?: string) =>
    api.patch(`/admin/vendor-applications/${id}`, { status, reviewNotes }).then((r) => r.data),
  getVendorCertifications: (status?: string) =>
    api.get(`/admin/vendor-certifications${status ? `?status=${status}` : ''}`).then((r) => r.data),
  reviewVendorCertification: (id: string, status: string, reviewNotes?: string) =>
    api.patch(`/admin/vendor-certifications/${id}`, { status, reviewNotes }).then((r) => r.data),
  getMonitoringSetupRequests: () => api.get('/admin/monitoring-setup-requests').then((r) => r.data),
  requestMonitoringConnection: (customerId: string) =>
    api.post(`/admin/monitoring-setup-requests/${customerId}/request`).then((r) => r.data),
  linkYolinkHome: (data: { customerId: string; yolinkUAID: string; yolinkSecretKey: string; homeName: string; address?: string }) =>
    api.post('/yolink/link', data).then((r) => r.data),
  getWaitlist: () => api.get('/admin/waitlist').then((r) => r.data),
};

export const userApi = {
  getMe: () => api.get('/users/me').then((r) => r.data),
};
