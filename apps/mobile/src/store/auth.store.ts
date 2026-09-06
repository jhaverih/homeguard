import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { setMemoryToken, userApi, legalApi } from '../services/api';
import { disconnectSocket } from '../services/socket';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  activeRole: string;
  avatarUrl?: string;
  termsAcceptedAt?: string | null;
  tosVersion?: string | null;
  vendorTermsAcceptedAt?: string | null;
  vendorTosVersion?: string | null;
  facilitatorDisclosureAcceptedAt?: string | null;
  facilitatorDisclosureVersion?: string | null;
  // Already returned by /auth/login, /auth/register, and /users/me today — this
  // was just never typed on the client before certification management needed
  // to gate itself on company-admin status.
  vendorProfile?: { isCompanyAdmin: boolean; companyId?: string | null } | null;
}

interface LegalVersions {
  customerTosVersion: string;
  vendorTosVersion: string;
  facilitatorDisclosureVersion: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  // Currently-published version per legal document, fetched fresh every
  // cold start (not persisted — it's tiny and can go stale). null until
  // fetchLegalVersions() resolves; see src/utils/legal.ts's
  // needsReacceptance(), which deliberately does not gate on null/undefined.
  legalVersions: LegalVersions | null;
  setAuth: (user: User, token: string) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  fetchLegalVersions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  legalVersions: null,

  setAuth: async (user, token) => {
    setMemoryToken(token);
    await SecureStore.setItemAsync('accessToken', token);
    await SecureStore.setItemAsync('user', JSON.stringify(user));
    set({ user, token });
  },

  setUser: (user) => {
    SecureStore.setItemAsync('user', JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    // Must happen before setMemoryToken(null) wipes the auth header — this
    // device's Expo push token is stable per app-install, so without
    // clearing it here the departing account keeps receiving this device's
    // notifications indefinitely if a different account logs in next
    // (a real incident: two test accounts on one phone each got the
    // other's alerts). Best-effort — a failed clear shouldn't block logout.
    await userApi.clearPushToken().catch(() => {});
    disconnectSocket();
    setMemoryToken(null);
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('user');
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      const userStr = await SecureStore.getItemAsync('user');
      if (token && userStr) {
        setMemoryToken(token);
        set({ user: JSON.parse(userStr), token });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // Best-effort — a failed fetch just means needsReacceptance() stays
  // false everywhere (see its own comment) until the next successful call,
  // rather than the app breaking offline or on a flaky connection.
  fetchLegalVersions: async () => {
    try {
      const legalVersions = await legalApi.getVersions();
      set({ legalVersions });
    } catch {
      // leave legalVersions as-is
    }
  },
}));
