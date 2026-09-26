import {
  Archive,
  Bath,
  Bed,
  BookOpen,
  ChefHat,
  DoorOpen,
  Home,
  Sofa,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

export const ROOM_ICON_OPTIONS = [
  { key: "bed", icon: Bed, labelKey: "roomIcon.bed" },
  { key: "sofa", icon: Sofa, labelKey: "roomIcon.sofa" },
  { key: "bath", icon: Bath, labelKey: "roomIcon.bath" },
  { key: "chef-hat", icon: ChefHat, labelKey: "roomIcon.chef-hat" },
  { key: "archive", icon: Archive, labelKey: "roomIcon.archive" },
  { key: "book-open", icon: BookOpen, labelKey: "roomIcon.book-open" },
  { key: "door-open", icon: DoorOpen, labelKey: "roomIcon.door-open" },
  { key: "home", icon: Home, labelKey: "roomIcon.home" },
] as const;

export type RoomIconKey = (typeof ROOM_ICON_OPTIONS)[number]["key"];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ROOM_ICON_OPTIONS.map((o) => [o.key, o.icon])
);

export function getRoomIcon(key: string): LucideIcon {
  return ICON_MAP[key] ?? Home;
}

export const ROOM_COLOR_OPTIONS = [
  "text-sky-500",
  "text-emerald-600",
  "text-violet-500",
  "text-orange-500",
  "text-amber-500",
  "text-blue-600",
  "text-rose-500",
  "text-pink-500",
] as const;
