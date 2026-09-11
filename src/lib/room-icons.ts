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

export const ROOM_ICON_OPTIONS = [
  { key: "bed", icon: Bed, label: "Bedroom" },
  { key: "sofa", icon: Sofa, label: "Living room" },
  { key: "bath", icon: Bath, label: "Bathroom" },
  { key: "chef-hat", icon: ChefHat, label: "Kitchen" },
  { key: "archive", icon: Archive, label: "Storage" },
  { key: "book-open", icon: BookOpen, label: "Study" },
  { key: "door-open", icon: DoorOpen, label: "Entrance" },
  { key: "home", icon: Home, label: "Other" },
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
