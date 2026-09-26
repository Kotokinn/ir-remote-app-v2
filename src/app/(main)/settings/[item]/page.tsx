import { SettingsItemView } from "@/components/settings/settings-item-view";
import { SETTINGS_ITEMS } from "@/lib/mock-data";

// "household" has its own real page (settings/household); this placeholder is for the rest.
export function generateStaticParams() {
  return SETTINGS_ITEMS.filter((item) => item.id !== "household").map((item) => ({ item: item.id }));
}

export default async function SettingsItemPage({
  params,
}: {
  params: Promise<{ item: string }>;
}) {
  const { item } = await params;
  return <SettingsItemView id={item} />;
}
