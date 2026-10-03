import {
  Lightbulb,
  AirVent,
  Radio,
  Blinds,
  PersonStanding,
  ShieldCheck,
  Power,
  AlarmClock,
  Bell,
  UserRound,
  Users,
  ShieldQuestion,
  RefreshCw,
  LifeBuoy,
  Lightbulb as TipIcon,
  type LucideIcon,
} from "lucide-react";
import type { RemoteButton } from "@/lib/remote-buttons";
import type { TKey } from "@/lib/i18n";

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
  nameKey: TKey;
  icon: LucideIcon;
  color: string;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  lighting: { id: "lighting", nameKey: "category.lighting", icon: Lightbulb, color: "text-amber-500" },
  hvac: { id: "hvac", nameKey: "category.hvac", icon: AirVent, color: "text-sky-500" },
  ir: { id: "ir", nameKey: "category.ir", icon: Radio, color: "text-rose-500" },
  curtains: { id: "curtains", nameKey: "category.curtains", icon: Blinds, color: "text-emerald-600" },
  sensors: { id: "sensors", nameKey: "category.sensors", icon: PersonStanding, color: "text-orange-500" },
  security: { id: "security", nameKey: "category.security", icon: ShieldCheck, color: "text-blue-600" },
  switches: { id: "switches", nameKey: "category.switches", icon: Power, color: "text-fuchsia-500" },
  alarm: { id: "alarm", nameKey: "category.alarm", icon: AlarmClock, color: "text-red-500" },
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
  /** Shown on the Favorites page for quick access. Local UI preference, synced like any other field. */
  isFavorite?: boolean;
  /** Physical hub/module (PhysicalDevice.id) this virtual device is derived from, if any. */
  hubId?: string;
  // Household sharing — set by the server, absent on a device that was just built locally.
  /** Whose device it is (not the signed-in account's, for one shared with them). */
  ownerAccountId?: number;
  /** How the signed-in account reaches it: owns it, was given its room, or was given just this device. */
  access?: "owner" | "room" | "device";
  /** May rename/delete it: the owner always, a room member only for devices they added. Undefined = yes. */
  canEdit?: boolean;
  // toggle (kind: "toggle") backed by a relay8/SmartSwitch hub — its channel, 1-8 (setRelay's
  // `relay` param). Unset for a plain toggle that isn't wired to a real relay.
  relayIndex?: number;
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
  labelKey: TKey;
  icon: LucideIcon;
}

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "new-brands", labelKey: "settings.items.new-brands", icon: Bell },
  { id: "profile", labelKey: "settings.items.profile", icon: UserRound },
  { id: "household", labelKey: "settings.items.household", icon: Users },
  { id: "account", labelKey: "settings.items.account", icon: ShieldQuestion },
  { id: "sync-options", labelKey: "settings.items.sync-options", icon: RefreshCw },
  { id: "support", labelKey: "settings.items.support", icon: LifeBuoy },
  { id: "tips", labelKey: "settings.items.tips", icon: TipIcon },
];
