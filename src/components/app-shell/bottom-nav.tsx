"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 items-center justify-between border-t border-border bg-card px-2 py-2 md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium"
          >
            <Icon
              className={cn(
                "size-5",
                active ? "text-primary" : "text-muted-foreground"
              )}
              strokeWidth={active ? 2.4 : 2}
            />
            <span className={cn(active ? "text-primary" : "text-muted-foreground")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
