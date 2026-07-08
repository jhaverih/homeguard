import { create } from 'zustand';
import * as Notifications from 'expo-notifications';

interface AlertsState {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  increment: () => void;
  decrement: () => void;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  unreadCount: 0,

  setUnreadCount: (n) => {
    set({ unreadCount: n });
    Notifications.setBadgeCountAsync(n).catch(() => {});
  },

  increment: () => {
    const next = get().unreadCount + 1;
    set({ unreadCount: next });
    Notifications.setBadgeCountAsync(next).catch(() => {});
  },

  decrement: () => {
    const next = Math.max(0, get().unreadCount - 1);
    set({ unreadCount: next });
    Notifications.setBadgeCountAsync(next).catch(() => {});
  },
}));
