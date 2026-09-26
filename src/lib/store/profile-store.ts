"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getMe } from "@/lib/api/user";

interface ProfileState {
  /** Whose profile this is, so a cache left by another account is never shown. */
  accountId: number | null;
  fullName: string | null;
  fetchProfile: (accountId: number) => Promise<void>;
  clear: () => void;
}

/**
 * The signed-in user's display name. Cached so Settings paints it at once and the fetch only refreshes it
 * in the background (previously the name popped in after every visit).
 */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      accountId: null,
      fullName: null,
      fetchProfile: async (accountId) => {
        try {
          const profile = await getMe();
          set({ accountId, fullName: profile.fullName });
        } catch (error) {
          // Keep whatever is cached: offline must not blank the name.
          console.error("[profile] failed to load profile", error);
          if (get().accountId !== accountId) set({ accountId, fullName: null });
        }
      },
      clear: () => {
        set({ accountId: null, fullName: null });
      },
    }),
    {
      name: "smart-home-profile",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: (state) => ({ accountId: state.accountId, fullName: state.fullName }),
    }
  )
);
