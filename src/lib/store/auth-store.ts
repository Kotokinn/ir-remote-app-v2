"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as authApi from "@/lib/api/auth";

interface AuthAccount {
  id: number;
  email: string;
  roles: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  account: AuthAccount | null;
  hydrated: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  setSession: (accessToken: string, refreshToken: string) => void;
  refreshAccessToken: () => Promise<string>;
  logout: () => void;
}

interface AccessTokenClaims {
  sub: string;
  accountId: number;
  scope: string;
}

function accountFromAccessToken(accessToken: string): AuthAccount {
  const payload = accessToken.split(".").at(1) ?? "";
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(json) as AccessTokenClaims;
  const roles = claims.scope
    .split(" ")
    .filter((s) => s.startsWith("ROLE_"))
    .map((s) => s.slice("ROLE_".length));
  return { id: claims.accountId, email: claims.sub, roles };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      account: null,
      hydrated: false,
      loginWithGoogle: async (idToken) => {
        const response = await authApi.loginWithGoogle(idToken);
        set({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          account: {
            id: response.account.id,
            email: response.account.email,
            roles: response.account.roles,
          },
        });
      },
      setSession: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken, account: accountFromAccessToken(accessToken) });
      },
      refreshAccessToken: async () => {
        const currentRefreshToken = get().refreshToken;
        if (!currentRefreshToken) {
          throw new Error("No refresh token available");
        }
        const response = await authApi.refreshToken(currentRefreshToken);
        set({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          account: {
            id: response.account.id,
            email: response.account.email,
            roles: response.account.roles,
          },
        });
        return response.accessToken;
      },
      logout: () => {
        // Clear local session immediately regardless of the network — the user is logged out from
        // this device's point of view either way, and AuthGuard sends them to /login off this.
        const currentRefreshToken = get().refreshToken;
        set({ accessToken: null, refreshToken: null, account: null });
        if (currentRefreshToken) {
          authApi.logout(currentRefreshToken).catch((error: unknown) => {
            console.warn("[auth] server-side logout failed (session is still cleared locally)", error);
          });
        }
      },
    }),
    {
      name: "smart-home-auth",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      // A real set, not `state.hydrated = true`: mutating the rehydrated object doesn't notify subscribers, so a
      // component that already rendered (e.g. right after sign-in on the web, where nothing rehydrated the
      // store before) would never see the flag flip. Also runs when the stored value is missing or unreadable.
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hydrated: true });
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        account: state.account,
      }),
    }
  )
);
