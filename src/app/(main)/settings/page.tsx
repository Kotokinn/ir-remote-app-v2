"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut, UserRound } from "lucide-react";
import { SETTINGS_ITEMS } from "@/lib/mock-data";
import { useAuthStore } from "@/lib/store/auth-store";
import { getMe } from "@/lib/api/user";

export default function SettingsPage() {
  const router = useRouter();
  const account = useAuthStore((s) => s.account);
  const logout = useAuthStore((s) => s.logout);
  // Not on the JWT (see auth-store.ts's accountFromAccessToken — just email/roles/accountId), so a
  // dedicated call to user-service is the only way to get it. Silently falls back to the email below
  // on failure/absence (e.g. account created before this existed and hasn't logged in again yet) —
  // not worth an error state for a display label.
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((profile) => {
        if (!cancelled) setFullName(profile.fullName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // An empty name (never set, or set blank) falls back to the email just like a missing one.
  const hasName = fullName !== null && fullName.length > 0;
  const displayName = hasName ? fullName : (account?.email ?? "—");

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex items-center gap-3 rounded-2xl bg-brand-gradient px-4 py-4 text-primary-foreground shadow-lg shadow-primary/20">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/20">
          <UserRound className="size-6" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{displayName}</span>
          {hasName && <span className="text-xs text-white/80">{account?.email}</span>}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/settings/${item.id}`}
              className="flex items-center gap-3 px-4 py-3.5"
            >
              <Icon className="size-4 text-primary" />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3.5 text-sm font-medium text-destructive shadow-sm ring-1 ring-border"
      >
        <LogOut className="size-4" />
        Log out
      </button>
    </div>
  );
}
