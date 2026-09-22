import {
  Lightbulb,
  AirVent,
  Radio,
  Blinds,
  PersonStanding,
  ShieldCheck,
  Power,
  AlarmClock,
  Lamp,
  Sun,
  Thermometer,
  Lock,
  Bell,
  UserRound,
  ShieldQuestion,
  RefreshCw,
  LifeBuoy,
  Lightbulb as TipIcon,
  type LucideIcon,
} from "lucide-react";
import type { RemoteButton } from "@/lib/remote-buttons";

export type CategoryId =
  | "lighting"
  | "hvac"
  | "ir"
  | "curtains"
  | "sensors"
  | "security"
  | "switches"
  | "alarm";

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
  switches: { id: "switches", name: "Switches", icon: Power, color: "text-fuchsia-500" },
  alarm: { id: "alarm", name: "Alarm", icon: AlarmClock, color: "text-red-500" },
};

export type DeviceKind = "toggle" | "light" | "ac" | "remote" | "alarm" | "rgb";
export type AcMode = "cool" | "heat" | "fan" | "auto" | "dry";
export type FanSpeed = "auto" | "low" | "min" | "medium" | "high" | "max";
/**
 * Vertical swing (the louver's up/down sweep) — not horizontal swing, which the firmware/doc don't
 * expose. docs/MQTT_API.md's sendAc `swing` is a richer 0-7 enum; the app exposes these 4 (no "off").
 */
export type AcSwing = "auto" | "highest" | "middle" | "lowest";
/** docs/MQTT_API.md setSleepMode: who is sleeping, decides the default sleep temperature. */
export type AcSleepSubject = "child" | "adult" | "elder";
export type RgbEffect = "solid" | "blink" | "breathe" | "flow" | "chase";

export interface Device {
  id: string;
  name: string;
  roomId: string;
  categoryId: CategoryId;
  isOn: boolean;
  kind: DeviceKind;
  /** Physical hub/module (PhysicalDevice.id) this virtual device is derived from, if any. */
  hubId?: string;
  // light (kind: "light")
  mode?: "morning" | "day" | "night";
  intensity?: number;
  colorIndex?: number;
  // ac (kind: "ac")
  acMode?: AcMode;
  targetTemp?: number;
  fanSpeed?: FanSpeed;
  swing?: AcSwing;
  /** docs/MQTT_API.md setSleepMode. Not saved by the hub (resets on reboot) — same caveat as the
   * rest of this AC state: what's stored here is the app's last action, not a live read-back. */
  sleepEnabled?: boolean;
  sleepSubject?: AcSleepSubject;
  sleepWakeTime?: string;
  /** Overrides the per-subject default sleep temperature; unset = firmware picks it from subject. */
  sleepTargetTemp?: number;
  /** UI brand label picked in ac-setup.tsx, mapped to a real IR protocol name in lib/device/commands.ts. */
  brand?: string;
  // remote (kind: "remote")
  buttons?: RemoteButton[];
  // alarm (kind: "alarm")
  alarmTime?: string;
  alarmDays?: string[];
  // rgb (kind: "rgb")
  /** Hex ("#rrggbb") — the real setRgbColor value, picked from a swatch or the free-color picker. */
  color?: string;
  effect?: RgbEffect;
  effectSpeed?: number;
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

export function roomCategories(
  devices: Device[],
  roomId: string
): Array<Category & { count: number }> {
  const counts = new Map<CategoryId, number>();
  for (const device of devices) {
    if (roomId !== "all" && device.roomId !== roomId) continue;
    counts.set(device.categoryId, (counts.get(device.categoryId) ?? 0) + 1);
  }
  return Object.values(CATEGORIES).map((category) => ({
    ...category,
    count: counts.get(category.id) ?? 0,
  }));
}

export function categoryDevices(devices: Device[], roomId: string, categoryId: string) {
  return devices.filter(
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

export interface SceneAction {
  deviceId: string;
  patch: Partial<
    Pick<
      Device,
      | "isOn"
      | "mode"
      | "intensity"
      | "colorIndex"
      | "acMode"
      | "targetTemp"
      | "fanSpeed"
      | "swing"
      | "color"
      | "effect"
      | "effectSpeed"
    >
  >;
}

export interface Scene {
  id: string;
  name: string;
  actions: SceneAction[];
}

export interface Schedule {
  id: string;
  name: string;
  sceneId: string;
  startAt: string;
  days: number[];
  hasEnd: boolean;
  endAt?: string;
  enabled: boolean;
}

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
