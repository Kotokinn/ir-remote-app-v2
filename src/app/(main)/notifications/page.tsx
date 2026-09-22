"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarClock, Lock, Radio, Sparkles, type LucideIcon } from "lucide-react";
import { useNotificationsStore } from "@/lib/store/notifications-store";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { SwipeToDelete } from "@/components/notifications/swipe-to-delete";

const TYPE_ICONS: Record<string, LucideIcon> = {
  device_offline: Radio,
  device_online: Radio,
  device_firmware_updated: Sparkles,
  scene_activated: Sparkles,
  lock_event: Lock,
  schedule_reminder: CalendarClock,
};

function iconFor(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Bell;
}

export default function NotificationsPage() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const hydrated = useNotificationsStore((s) => s.hydrated);
  const loadFailed = useNotificationsStore((s) => s.loadFailed);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const markRead = useNotificationsStore((s) => s.markRead);
  const remove = useNotificationsStore((s) => s.remove);
  const [deleteError, setDeleteError] = useState(false);

  // Notifications are created on the server (hub offline, firmware updated...) while this screen is
  // open or the app is in the background, so keep the list fresh: on open, every 30 s, and whenever
  // the app comes back to the foreground.
  useEffect(() => {
    void fetchNotifications();
    const timer = window.setInterval(() => {
      void fetchNotifications();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchNotifications]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <h1 className="text-2xl font-bold">Notifications</h1>

      {loadFailed && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t refresh notifications. Check your connection; showing the last known list.
        </p>
      )}

      {deleteError && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t delete that notification. It was put back; try again.
        </p>
      )}

      {hydrated && !loadFailed && notifications.length === 0 && (
        <div className="flex flex-col items-center gap-1 pt-10 text-center">
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground">
            Alerts such as a hub going offline or being updated will show up here.
          </p>
        </div>
      )}

      {notifications.length > 0 && (
        <p className="-mt-3 text-[11px] text-muted-foreground">Swipe a notification sideways to delete it.</p>
      )}

      {/* overflow-x-clip: a row sliding off screen must not widen the page. */}
      <div className="flex flex-col gap-2 overflow-x-clip">
        {notifications.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <SwipeToDelete
              key={n.id}
              onDelete={() => {
                setDeleteError(false);
                remove(n.id).catch(() => {
                  setDeleteError(true);
                });
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (!n.read) void markRead(n.id);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-sm ring-1 ring-border",
                  n.read && "opacity-60"
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                </div>
              </button>
            </SwipeToDelete>
          );
        })}
      </div>
    </div>
  );
}
