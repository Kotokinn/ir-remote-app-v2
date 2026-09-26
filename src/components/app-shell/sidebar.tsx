"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home as HomeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";
import { UnreadBadge } from "@/components/app-shell/unread-badge";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-e border-border bg-card px-4 py-6 md:flex">
      <Link href="/home" className="flex items-center gap-2 px-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-primary-foreground">
          <HomeIcon className="size-4" />
        </span>
        <span className="text-base font-bold">{t("app.name")}</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
              {t(labelKey)}
              {href === "/notifications" && <UnreadBadge className="static ms-auto" />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
