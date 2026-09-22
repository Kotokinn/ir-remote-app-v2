"use client";

import { useUnreadNotificationCount } from "@/lib/store/notifications-store";
import { cn } from "@/lib/utils";

/** Small red count bubble for the corner of the Notifications icon; renders nothing when all read. */
export function UnreadBadge({ className }: { className?: string }) {
  const count = useUnreadNotificationCount();
  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} unread notifications`}
      className={cn(
        "pointer-events-none absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
