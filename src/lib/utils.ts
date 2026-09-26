export { cn } from "cn"
import { i18n } from "@/lib/i18n"

/** "now", "5 minutes ago", "yesterday"… in the current language (the browser's CLDR data covers them all). */
export function formatRelativeTime(iso: string): string {
  const formatter = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto", style: "narrow" });
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return formatter.format(0, "second");
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.floor(hours / 24), "day");
}
