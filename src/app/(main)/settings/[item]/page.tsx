import { PageHeader } from "@/components/app-shell/page-header";
import { SETTINGS_ITEMS } from "@/lib/mock-data";

export function generateStaticParams() {
  return SETTINGS_ITEMS.map((item) => ({ item: item.id }));
}

export default async function SettingsItemPage({
  params,
}: {
  params: Promise<{ item: string }>;
}) {
  const { item } = await params;
  const setting = SETTINGS_ITEMS.find((s) => s.id === item);
  const Icon = setting?.icon;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <PageHeader title={setting?.label ?? "Settings"} />
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        {Icon && (
          <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
            <Icon className="size-6" />
          </span>
        )}
        <p className="text-sm text-muted-foreground">
          {setting?.label ?? "This section"} is coming soon.
        </p>
      </div>
    </div>
  );
}
