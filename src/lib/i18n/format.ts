/**
 * Weekday names from the browser's own locale data (CLDR), so every language is covered without
 * translating them by hand. Monday-first, matching how the app numbers days (0 = Monday … 6 = Sunday).
 */
export function weekdayNames(language: string, width: "narrow" | "short" | "long" = "short"): string[] {
  const formatter = new Intl.DateTimeFormat(language, { weekday: width, timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2024, 0, 1 + index))));
}
