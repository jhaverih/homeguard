import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vendor_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      localStorage.removeItem('vendor_token');
      localStorage.removeItem('vendor_is_admin');
      window.location.replace('/login');
    }
    if (err.response?.status === 403 && typeof window !== 'undefined') {
      const message = err.response?.data?.message || "You don't have permission to do that.";
      window.dispatchEvent(new CustomEvent('vendor:forbidden', { detail: message }));
    }
    return Promise.reject(err);
  },
);

export const uploadsApi = {
  upload: async (file: File, folder: string): Promise<{ key: string; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`/uploads?folder=${encodeURIComponent(folder)}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export const vendorApi = {
  getCustomers: () => api.get('/vendor/customers').then((r) => r.data),
  getPayments: () => api.get('/vendor/payments').then((r) => r.data),
  getDisputes: () => api.get('/vendor/disputes').then((r) => r.data),
  getJobs: () => api.get('/vendor/jobs').then((r) => r.data),
  getJobReport: (id: string) => api.get(`/vendor/jobs/${id}/report`).then((r) => r.data),
  getSolarQuote: (requestId: string) => api.get(`/service-requests/${requestId}/solar-quote`).then((r) => r.data),
  submitSolarQuote: (requestId: string, data: {
    systemSizeKw: number; numInverters: number; inverterManufacturer: string; inverterModel: string;
    pvSystemPrice: number; storageSizeKwh?: number; storageManufacturer?: string; storageModel?: string; storagePrice?: number;
  }) => api.post(`/service-requests/${requestId}/solar-quote`, data).then((r) => r.data),
  assignJob: (id: string, technicianId: string) => api.patch(`/vendor/jobs/${id}/assign`, { technicianId }).then((r) => r.data),
  autoAssignJob: (id: string) => api.post(`/vendor/jobs/${id}/auto-assign`).then((r) => r.data),
  getStatus: () => api.get('/vendor/status').then((r) => r.data),
  requestElite: () => api.post('/vendor/status/request-elite').then((r) => r.data),
  retractEliteRequest: () => api.post('/vendor/status/retract-elite-request').then((r) => r.data),
  setAssignmentMode: (mode: string) => api.patch('/vendor/status/assignment-mode', { mode }).then((r) => r.data),
  getCompany: () => api.get('/vendor/company').then((r) => r.data),
  updateCompany: (data: { name?: string; logoKey?: string; baseZipCode?: string; serviceRadiusMiles?: number; serviceCounties?: string[] }) => api.patch('/vendor/company', data).then((r) => r.data),
  getCounties: (): Promise<Record<string, { fips: string; name: string }[]>> => api.get('/vendor/counties').then((r) => r.data),
  getTeam: () => api.get('/vendor/team').then((r) => r.data),
  createTechnician: (data: { email: string; firstName: string; lastName: string; avatarUrl?: string }) =>
    api.post('/vendor/team', data).then((r) => r.data),
  updateTeamMember: (id: string, data: { firstName?: string; lastName?: string; avatarUrl?: string }) =>
    api.patch(`/vendor/team/${id}`, data).then((r) => r.data),
  removeTeamMember: (id: string) => api.delete(`/vendor/team/${id}`).then((r) => r.data),
  getCustomerHistory: (id: string) => api.get(`/vendor/customers/${id}/history`).then((r) => r.data),
  connectMonitoring: (data: { customerId: string; yolinkUAID: string; yolinkSecretKey: string; homeName: string; address?: string }) =>
    api.post('/yolink/link', data).then((r) => r.data),
  getCapabilities: () => api.get('/vendor/capabilities').then((r) => r.data),
  getMyCapabilities: () => api.get('/vendor/me/capabilities').then((r) => r.data),
  setMyCapabilities: (capabilityIds: string[]) => api.patch('/vendor/me/capabilities', { capabilityIds }).then((r) => r.data),
  acknowledgeCapability: (capabilityId: string) => api.post(`/vendor/me/capabilities/${capabilityId}/acknowledge`).then((r) => r.data),
  getMyCertifications: () => api.get('/vendor/me/certifications').then((r) => r.data),
  submitCertification: (data: any) => api.post('/vendor/me/certifications', data).then((r) => r.data),
  updateCertification: (id: string, data: any) => api.patch(`/vendor/me/certifications/${id}`, data).then((r) => r.data),
  getApplication: () => api.get('/vendor/application').then((r) => r.data),
  submitApplication: (data: any) => api.post('/vendor/application', data).then((r) => r.data),
};

export const userApi = {
  getMe: () => api.get('/users/me').then((r) => r.data),
  updateProfile: (data: any) => api.patch('/users/me/profile', data).then((r) => r.data),
};

// Card-on-file management for the Elite membership fee — these endpoints
// are role-agnostic (any authenticated user, customer or vendor); the
// backend already reuses the same Stripe Customer plumbing for both.
export const paymentsApi = {
  createSetupIntent: (): Promise<{ setupIntentClientSecret: string; customerId: string }> =>
    api.post('/payments/setup-intent').then((r) => r.data),
  listMethods: (): Promise<{ id: string; brand: string; last4: string; isDefault: boolean }[]> =>
    api.get('/payments/methods').then((r) => r.data),
  setDefaultMethod: (id: string) => api.patch(`/payments/methods/${id}/default`).then((r) => r.data),
  removeMethod: (id: string) => api.delete(`/payments/methods/${id}`).then((r) => r.data),
};
