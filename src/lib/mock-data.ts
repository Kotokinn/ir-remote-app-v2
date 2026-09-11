import {
  Lightbulb,
  AirVent,
  Radio,
  Blinds,
  PersonStanding,
  ShieldCheck,
  Lamp,
  Sun,
  Thermometer,
  Lock,
  CalendarClock,
  SlidersHorizontal,
  Bell,
  UserRound,
  ShieldQuestion,
  RefreshCw,
  LifeBuoy,
  Lightbulb as TipIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type CategoryId =
  | "lighting"
  | "hvac"
  | "ir"
  | "curtains"
  | "sensors"
  | "security";

export interface Category {
  id: CategoryId;
  name: string;
  icon: LucideIcon;
  color: string;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  lighting: { id: "lighting", name: "Lighting", icon: Lightbulb, color: "text-amber-500" },
  hvac: { id: "hvac", name: "HVAC", icon: AirVent, color: "text-sky-500" },
  ir: { id: "ir", name: "IR Control", icon: Radio, color: "text-rose-500" },
  curtains: { id: "curtains", name: "Curtains", icon: Blinds, color: "text-emerald-600" },
  sensors: { id: "sensors", name: "Sensors", icon: PersonStanding, color: "text-orange-500" },
  security: { id: "security", name: "Security", icon: ShieldCheck, color: "text-blue-600" },
};

export interface Device {
  id: string;
  name: string;
  roomId: string;
  categoryId: CategoryId;
  icon: LucideIcon;
  isOn: boolean;
  mode?: "morning" | "day" | "night";
  intensity?: number;
  colorIndex?: number;
}

export const SHADE_COLORS = [
  "#ef4444",
  "#f43f5e",
  "#ec4899",
  "#a855f7",
  "#4f46e5",
  "#3b82f6",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#dc2626",
];

// Devices are added by the user per room; there is no seeded/default device list.
export const DEVICES: Device[] = [];

export function roomCategories(roomId: string): Array<Category & { count: number }> {
  const counts = new Map<CategoryId, number>();
  for (const device of DEVICES) {
    if (roomId !== "all" && device.roomId !== roomId) continue;
    counts.set(device.categoryId, (counts.get(device.categoryId) ?? 0) + 1);
  }
  return Object.values(CATEGORIES).map((category) => ({
    ...category,
    count: counts.get(category.id) ?? 0,
  }));
}

export function categoryDevices(roomId: string, categoryId: string) {
  return DEVICES.filter(
    (d) => (roomId === "all" || d.roomId === roomId) && d.categoryId === categoryId
  );
}

export function getCategory(id: string): Category | undefined {
  return (CATEGORIES as Record<string, Category>)[id];
}

export interface FavoriteDevice {
  id: string;
  name: string;
  icon: LucideIcon;
  isOn: boolean;
  mode?: "morning" | "day" | "night";
  intensity?: number;
  colorIndex?: number;
  controllable: boolean;
}

export const FAVORITES: FavoriteDevice[] = [
  { id: "fav-dimmer", name: "Dimmer", icon: Sun, isOn: false, controllable: true, intensity: 30, mode: "day", colorIndex: 3 },
  { id: "fav-tubelight", name: "Tubelight", icon: Lightbulb, isOn: true, controllable: true, intensity: 80, mode: "day", colorIndex: 5 },
  { id: "fav-bedlamp", name: "Bed lamp", icon: Lamp, isOn: true, controllable: true, intensity: 68, mode: "day", colorIndex: 7 },
  { id: "fav-thermostat", name: "Hall thermostat", icon: Thermometer, isOn: false, controllable: false },
  { id: "fav-ac", name: "AC", icon: AirVent, isOn: false, controllable: false },
  { id: "fav-lock", name: "Front door lock", icon: Lock, isOn: false, controllable: false },
  { id: "fav-curtain", name: "Curtain", icon: Blinds, isOn: false, controllable: false },
  { id: "fav-presence", name: "Presence mode", icon: PersonStanding, isOn: true, controllable: false },
];

export interface Scene {
  id: string;
  name: string;
  deviceCount: number;
}

export const SCENES: Scene[] = [
  { id: "scene-going-out", name: "Going out", deviceCount: 15 },
  { id: "scene-movie-night", name: "Movie night", deviceCount: 8 },
  { id: "scene-good-morning", name: "Good morning", deviceCount: 10 },
  { id: "scene-bedtime", name: "Bedtime", deviceCount: 12 },
];

export interface Schedule {
  id: string;
  name: string;
  deviceCount: number;
  startAt: string;
  endAt: string;
  days: string[];
}

export const SCHEDULES: Schedule[] = [
  { id: "sch-going-out", name: "Going out", deviceCount: 15, startAt: "8:00 AM", endAt: "9:00 AM", days: ["M", "T", "S"] },
  { id: "sch-dinner", name: "Having Dinner", deviceCount: 15, startAt: "7:30 PM", endAt: "8:30 PM", days: ["M", "T", "W", "T", "F"] },
  { id: "sch-relax", name: "Relax time", deviceCount: 15, startAt: "9:00 PM", endAt: "10:00 PM", days: ["S", "S"] },
  { id: "sch-excercise", name: "Excercise", deviceCount: 15, startAt: "8:00 AM", endAt: "9:00 AM", days: ["M", "T", "S"] },
  { id: "sch-bathing", name: "Bathing", deviceCount: 15, startAt: "7:00 AM", endAt: "7:30 AM", days: ["M", "T", "W", "T", "F", "S", "S"] },
];

export const SCHEDULE_ICON = SlidersHorizontal;
export const SCHEDULE_TIME_ICON = CalendarClock;

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  icon: LucideIcon;
}

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n1", title: "Wifi connection lost", body: "Bedroom hub went offline. Devices may not respond.", time: "2m ago", icon: Radio },
  { id: "n2", title: "Scene activated", body: "“Going out” turned off 15 devices.", time: "1h ago", icon: Sparkles },
  { id: "n3", title: "Front door lock", body: "Locked automatically at 11:00 PM.", time: "Yesterday", icon: Lock },
  { id: "n4", title: "Schedule reminder", body: "“Excercise” schedule starts in 10 minutes.", time: "Yesterday", icon: CalendarClock },
];

export interface SettingsItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "new-brands", label: "New brands", icon: Bell },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "account", label: "Account", icon: ShieldQuestion },
  { id: "sync-options", label: "Sync options", icon: RefreshCw },
  { id: "support", label: "Support", icon: LifeBuoy },
  { id: "tips", label: "Tips", icon: TipIcon },
];
