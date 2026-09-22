"use client";

import { create } from "zustand";
import { ApiError } from "@/lib/api/http";
import { notificationsApi, type NotificationResponse } from "@/lib/api/smart";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function fromResponse(response: NotificationResponse): AppNotification {
  return {
    id: String(response.id),
    type: response.type,
    title: response.title,
    body: response.body,
    read: response.read,
    createdAt: response.createdAt,
  };
}

interface NotificationsState {
  notifications: AppNotification[];
  hydrated: boolean;
  /** True when the last refresh failed (so the page can say so instead of looking empty). */
  loadFailed: boolean;
  fetchNotifications: () => Promise<void>;
  /** A notification pushed by the live stream: add it (or refresh it) at the top of the list. */
  receive: (response: NotificationResponse) => void;
  markRead: (id: string) => Promise<void>;
  /** Deletes a notification: gone from the list at once, put back if the server refuses. */
  remove: (id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: [],
  hydrated: false,
  loadFailed: false,
  fetchNotifications: async () => {
    try {
      const notifications = await notificationsApi.list();
      set({ notifications: notifications.map(fromResponse), hydrated: true, loadFailed: false });
    } catch (error) {
      console.error("[notifications] refresh failed", error);
      set({ hydrated: true, loadFailed: true });
    }
  },
  receive: (response) => {
    const incoming = fromResponse(response);
    set((state) => ({
      // The same notification can arrive both from the stream and from a list refresh.
      notifications: [incoming, ...state.notifications.filter((n) => n.id !== incoming.id)],
    }));
  },
  remove: async (id) => {
    const before = useNotificationsStore.getState().notifications;
    const removed = before.find((n) => n.id === id);
    if (!removed) return;
    set({ notifications: before.filter((n) => n.id !== id) });
    try {
      await notificationsApi.remove(Number(id));
    } catch (error) {
      // 404 = already deleted elsewhere (another device): that is the outcome the user wanted.
      if (error instanceof ApiError && error.status === 404) return;
      console.error("[notifications] delete failed", error);
      set((state) =>
        state.notifications.some((n) => n.id === id)
          ? state
          : {
              notifications: [...state.notifications, removed].sort(
                (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
              ),
            }
      );
      throw error;
    }
  },
  markRead: async (id) => {
    const updated = await notificationsApi.markRead(Number(id));
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? fromResponse(updated) : n)),
    }));
  },
}));

/** How many notifications the user has not opened yet (drives the badge on the navigation icon). */
export function useUnreadNotificationCount(): number {
  return useNotificationsStore((state) => state.notifications.filter((n) => !n.read).length);
}
