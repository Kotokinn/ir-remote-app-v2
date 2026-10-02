import type { ReactNode } from "react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PullToRefresh } from "@/components/app-shell/pull-to-refresh";
import { DataHydrator } from "@/components/app-shell/data-hydrator";
import { AuthGuard } from "@/components/app-shell/auth-guard";
import { JoinLinkListener } from "@/components/app-shell/join-link-listener";
import { SyncStatus } from "@/components/app-shell/sync-status";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] md:flex-row">
      <AuthGuard />
      <JoinLinkListener />
      <DataHydrator />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <SyncStatus />
        <PullToRefresh>{children}</PullToRefresh>
        <BottomNav />
      </div>
    </div>
  );
}
