import type { ReactNode } from "react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PullToRefresh } from "@/components/app-shell/pull-to-refresh";
import { DataHydrator } from "@/components/app-shell/data-hydrator";
import { AuthGuard } from "@/components/app-shell/auth-guard";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background md:flex-row">
      <AuthGuard />
      <DataHydrator />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PullToRefresh>{children}</PullToRefresh>
        <BottomNav />
      </div>
    </div>
  );
}
