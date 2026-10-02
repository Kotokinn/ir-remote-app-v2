"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";
import { UnreadBadge } from "@/components/app-shell/unread-badge";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className="flex shrink-0 items-center justify-between border-t border-border bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium"
          >
            <span className="relative">
              <Icon
                className={cn(
                  "size-5",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {href === "/notifications" && <UnreadBadge className="-top-1.5 -end-2.5" />}
            </span>
            <span className={cn(active ? "text-primary" : "text-muted-foreground")}>
              {t(labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
