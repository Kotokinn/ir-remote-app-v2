import { NOTIFICATIONS } from "@/lib/mock-data";

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <h1 className="text-2xl font-bold">Notifications</h1>

      <div className="flex flex-col gap-2">
        {NOTIFICATIONS.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Icon className="size-4" />
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {n.time}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{n.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
