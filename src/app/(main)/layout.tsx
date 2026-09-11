import type { ReactNode } from "react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PullToRefresh } from "@/components/app-shell/pull-to-refresh";
import { RoomsHydrator } from "@/components/app-shell/rooms-hydrator";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background md:flex-row">
      <RoomsHydrator />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PullToRefresh>{children}</PullToRefresh>
        <BottomNav />
      </div>
    </div>
  );
}
