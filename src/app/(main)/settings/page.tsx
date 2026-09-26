"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Globe, LogOut, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SETTINGS_ITEMS } from "@/lib/mock-data";
import { findLanguage } from "@/lib/i18n/languages";
import { LanguageDialog } from "@/components/settings/language-dialog";
import { useAuthStore } from "@/lib/store/auth-store";
import { useProfileStore } from "@/lib/store/profile-store";
import { syncEngine } from "@/lib/sync";
import { useOutboxStore, useOutboxSummary } from "@/lib/sync/outbox-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function SettingsPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);
  const account = useAuthStore((s) => s.account);
  const logout = useAuthStore((s) => s.logout);
  // Not on the JWT (see auth-store.ts's accountFromAccessToken — just email/roles/accountId), so it comes
  // from user-service and is cached in the profile store (loaded by DataHydrator): shown at once here, and
  // falls back to the email when absent (e.g. an account that predates names).
  const fullName = useProfileStore((s) => (s.accountId === account?.id ? s.fullName : null));

  // An empty name (never set, or set blank) falls back to the email just like a missing one.
  const hasName = fullName !== null && fullName.length > 0;
  const displayName = hasName ? fullName : (account?.email ?? "—");

  const { pending, failed } = useOutboxSummary();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  function signOut() {
    logout();
    router.replace("/login");
  }

  // Changes not yet on the server exist only on this device: signing out must not silently lose them.
  function handleLogout() {
    if (pending + failed === 0) signOut();
    else {
      setSyncError(null);
      setConfirmingLogout(true);
    }
  }

  async function syncThenSignOut() {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncEngine.resume();
    } finally {
      setSyncing(false);
    }
    const left = useOutboxStore.getState().ops.length;
    if (left === 0) {
      setConfirmingLogout(false);
      signOut();
    } else {
      setSyncError(t("settings.logoutDialog.stillPending", { count: left }));
    }
  }

  function discardAndSignOut() {
    useOutboxStore.getState().discardAll();
    setConfirmingLogout(false);
    signOut();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

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
        <button
          type="button"
          onClick={() => {
            setLanguageOpen(true);
          }}
          className="flex items-center gap-3 px-4 py-3.5 text-start"
        >
          <Globe className="size-4 text-primary" />
          <span className="flex-1 text-sm font-medium">{t("settings.language")}</span>
          <span className="text-xs text-muted-foreground">{findLanguage(i18n.language)?.nativeName}</span>
          <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
        </button>
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/settings/${item.id}`}
              className="flex items-center gap-3 px-4 py-3.5"
            >
              <Icon className="size-4 text-primary" />
              <span className="flex-1 text-sm font-medium">{t(item.labelKey)}</span>
              <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
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
        {t("settings.logout")}
      </button>

      <LanguageDialog open={languageOpen} onOpenChange={setLanguageOpen} />

      <Dialog open={confirmingLogout} onOpenChange={(open) => { if (!syncing) setConfirmingLogout(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.logoutDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("settings.logoutDialog.body", { count: pending + failed })}
            </DialogDescription>
          </DialogHeader>
          {syncError && <p className="text-xs text-destructive">{syncError}</p>}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={() => {
                void syncThenSignOut();
              }}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {syncing ? t("settings.logoutDialog.syncing") : t("settings.logoutDialog.syncThenSignOut")}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={discardAndSignOut}
              className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive disabled:opacity-60"
            >
              {t("settings.logoutDialog.discard")}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => {
                setConfirmingLogout(false);
              }}
              className="px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              {t("common.cancel")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
