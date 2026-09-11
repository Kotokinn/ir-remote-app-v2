import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";
import { SETTINGS_ITEMS } from "@/lib/mock-data";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex items-center gap-3 rounded-2xl bg-brand-gradient px-4 py-4 text-primary-foreground shadow-lg shadow-primary/20">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/20">
          <UserRound className="size-6" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Signed in user</span>
          <span className="text-xs text-white/80">you@example.com</span>
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
    </div>
  );
}
