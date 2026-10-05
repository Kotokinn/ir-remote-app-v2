import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Fan,
  FastForward,
  Hash,
  Home,
  type LucideIcon,
  Menu,
  Play,
  Power,
  Rewind,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Thermometer,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { type TKey, t } from "@/lib/i18n";

export type RemoteButtonGroupId =
  | "power"
  | "nav"
  | "volume"
  | "playback"
  | "numbers"
  | "custom";

export interface RemoteButtonPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  group: RemoteButtonGroupId;
}

export interface RemoteButton {
  id: string;
  label: string;
  iconKey: string;
  group: RemoteButtonGroupId;
  /** The learned IR code (base64 of µs samples, see lib/device/ir-learn.ts). Absent until the button is learned. */
  ir?: { base64: string };
}

export const REMOTE_BUTTON_GROUPS: Array<{
  id: RemoteButtonGroupId;
  labelKey: TKey;
}> = [
  { id: "power", labelKey: "remoteGroup.power" },
  { id: "nav", labelKey: "remoteGroup.nav" },
  { id: "volume", labelKey: "remoteGroup.volume" },
  { id: "playback", labelKey: "remoteGroup.playback" },
  { id: "numbers", labelKey: "remoteGroup.numbers" },
  { id: "custom", labelKey: "remoteGroup.custom" },
];

export const REMOTE_BUTTON_PRESETS: RemoteButtonPreset[] = [
  { id: "power", label: "Power", icon: Power, group: "power" },

  { id: "nav-up", label: "Up", icon: ChevronUp, group: "nav" },
  { id: "nav-down", label: "Down", icon: ChevronDown, group: "nav" },
  { id: "nav-left", label: "Left", icon: ChevronLeft, group: "nav" },
  { id: "nav-right", label: "Right", icon: ChevronRight, group: "nav" },
  { id: "nav-ok", label: "OK", icon: Circle, group: "nav" },
  { id: "nav-back", label: "Back", icon: ArrowLeft, group: "nav" },
  { id: "nav-home", label: "Home", icon: Home, group: "nav" },
  { id: "nav-menu", label: "Menu", icon: Menu, group: "nav" },

  { id: "vol-up", label: "Vol +", icon: Volume2, group: "volume" },
  { id: "vol-down", label: "Vol -", icon: Volume1, group: "volume" },
  { id: "vol-mute", label: "Mute", icon: VolumeX, group: "volume" },
  { id: "ch-up", label: "Ch +", icon: ChevronUp, group: "volume" },
  { id: "ch-down", label: "Ch -", icon: ChevronDown, group: "volume" },

  { id: "play-pause", label: "Play/Pause", icon: Play, group: "playback" },
  { id: "stop", label: "Stop", icon: Square, group: "playback" },
  { id: "rewind", label: "Rewind", icon: Rewind, group: "playback" },
  { id: "forward", label: "Forward", icon: FastForward, group: "playback" },
  { id: "prev", label: "Previous", icon: SkipBack, group: "playback" },
  { id: "next", label: "Next", icon: SkipForward, group: "playback" },

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `num-${i}`,
    label: String(i),
    icon: Hash,
    group: "numbers" as const,
  })),
];

export const REMOTE_BUTTON_ICON_MAP: Record<string, LucideIcon> =
  Object.fromEntries(REMOTE_BUTTON_PRESETS.map((p) => [p.id, p.icon]));
REMOTE_BUTTON_ICON_MAP.custom = Sparkles;
REMOTE_BUTTON_ICON_MAP["ac-temp-up"] = Thermometer;
REMOTE_BUTTON_ICON_MAP["ac-temp-down"] = Thermometer;
REMOTE_BUTTON_ICON_MAP["ac-mode"] = Sparkles;
REMOTE_BUTTON_ICON_MAP["ac-fan"] = Fan;

const PRESET_LABEL_KEYS: Partial<Record<string, TKey>> = {
  power: "remoteButton.power",
  "nav-up": "remoteButton.nav-up",
  "nav-down": "remoteButton.nav-down",
  "nav-left": "remoteButton.nav-left",
  "nav-right": "remoteButton.nav-right",
  "nav-ok": "remoteButton.nav-ok",
  "nav-back": "remoteButton.nav-back",
  "nav-home": "remoteButton.nav-home",
  "nav-menu": "remoteButton.nav-menu",
  "vol-up": "remoteButton.vol-up",
  "vol-down": "remoteButton.vol-down",
  "vol-mute": "remoteButton.vol-mute",
  "ch-up": "remoteButton.ch-up",
  "ch-down": "remoteButton.ch-down",
  "play-pause": "remoteButton.play-pause",
  stop: "remoteButton.stop",
  rewind: "remoteButton.rewind",
  forward: "remoteButton.forward",
  prev: "remoteButton.prev",
  next: "remoteButton.next",
  "ac-temp-up": "remoteButton.ac-temp-up",
  "ac-temp-down": "remoteButton.ac-temp-down",
  "ac-mode": "remoteButton.ac-mode",
  "ac-fan": "remoteButton.ac-fan",
};

/**
 * What to show on a button: the app's own presets are translated at display time (so a button learned
 * in one language reads correctly in another); a custom button shows the name the user typed.
 */
export function remoteButtonLabel(
  iconKey: string,
  storedLabel: string,
): string {
  const key = PRESET_LABEL_KEYS[iconKey];
  return key ? t(key) : storedLabel;
}

export function getRemoteButtonIcon(iconKey: string): LucideIcon {
  return REMOTE_BUTTON_ICON_MAP[iconKey] ?? Sparkles;
}

/** Fallback preset list offered when a user's AC isn't in the code database. */
export const AC_FALLBACK_BUTTONS: RemoteButtonPreset[] = [
  { id: "power", label: "Power", icon: Power, group: "power" },
  { id: "ac-temp-up", label: "Temp +", icon: Thermometer, group: "custom" },
  { id: "ac-temp-down", label: "Temp -", icon: Thermometer, group: "custom" },
  { id: "ac-mode", label: "Mode", icon: Sparkles, group: "custom" },
  { id: "ac-fan", label: "Fan speed", icon: Fan, group: "custom" },
];
