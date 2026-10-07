// Maps the UI's generic device concepts to the device's real command vocabulary
// (docs/MQTT_API.md section 4 — sendAc / setRgbColor / setRgbMode). Only AC and RGB
// map cleanly to a real command today; "light" (morning/day/night) and "alarm" have no
// matching method in the doc yet, so they stay UI-only until the doc/firmware define one.
import type { AcState } from "@/components/devices/ac-control-panel";
import type { RgbState } from "@/components/devices/rgb-control-panel";
import { resolveAcProtocol } from "@/lib/device/ac-brands";
import type { AcMode, AcSleepSubject, RgbEffect } from "@/lib/mock-data";

const AC_MODE_TO_INT: Record<AcMode, number> = {
  auto: 0,
  cool: 1,
  heat: 2,
  dry: 3,
  fan: 4,
};

// docs/MQTT_API.md sendAc fan: 0=auto,1=low,2=medium,3=high,4=min,5=max (firmware toCommonFan matches).
const FAN_SPEED_TO_INT: Record<AcState["fanSpeed"], number> = {
  auto: 0,
  low: 1,
  medium: 2,
  high: 3,
  min: 4,
  max: 5,
};

// Vertical swing (louver up/down), not horizontal — the firmware/doc don't expose horizontal swing.
// docs/MQTT_API.md's swing is a richer 0-7 enum (off/auto/highest/high/middle/low/lowest/
// upperMiddle); the UI exposes these 7 (no "off" — swing is always in one of these positions).
const SWING_TO_INT: Record<AcState["swing"], number> = {
  auto: 1,
  highest: 2,
  high: 3,
  middle: 4,
  low: 5,
  lowest: 6,
  upperMiddle: 7,
};

export interface SendAcCommand {
  method: "sendAc";
  params: {
    protocol: string;
    power: boolean;
    temp: number;
    mode: number;
    fan: number;
    swing: number;
  };
}

export function buildSendAcCommand(
  brandOrProtocol: string,
  state: AcState,
): SendAcCommand {
  return {
    method: "sendAc",
    params: {
      protocol: resolveAcProtocol(brandOrProtocol),
      power: state.isOn,
      temp: state.targetTemp,
      mode: AC_MODE_TO_INT[state.acMode],
      fan: FAN_SPEED_TO_INT[state.fanSpeed],
      swing: SWING_TO_INT[state.swing],
    },
  };
}

export interface SleepModeState {
  enabled: boolean;
  /** Required by the firmware when enabling; ignored (and omitted) when disabling. */
  subject?: AcSleepSubject;
  wakeTime?: string;
  /** °C, 16-30, optional even when enabling. Unset = firmware default for `subject` (child/elder=27, adult=25). */
  targetTemp?: number;
}

export interface SetSleepModeCommand {
  method: "setSleepMode";
  params: {
    enabled: boolean;
    subject?: AcSleepSubject;
    wakeTime?: string;
    targetTemp?: number;
  };
}

// docs/MQTT_API.md setSleepMode: disabling never sends subject/wakeTime/targetTemp (turns off
// immediately, no IR sent); enabling needs subject+wakeTime, targetTemp stays optional (omitted ->
// firmware default for that subject).
export function buildSetSleepModeCommand(
  state: SleepModeState,
): SetSleepModeCommand {
  if (!state.enabled) {
    return { method: "setSleepMode", params: { enabled: false } };
  }
  return {
    method: "setSleepMode",
    params: {
      enabled: true,
      subject: state.subject,
      wakeTime: state.wakeTime,
      targetTemp: state.targetTemp,
    },
  };
}

// docs/MQTT_API.md setRgbMode: 0=OFF,1=STATIC,2=ROTATING,3=BREATHING,4=WAVE,5=RAINBOW,
// 6=STROBE,7=SPARKLE,8=CONFETTI,9=POLICE,10=COLOR_WIPE,11=FIRE. The UI only offers 5
// effects today — each maps to the closest real mode.
const RGB_EFFECT_TO_MODE: Record<RgbEffect, number> = {
  solid: 1,
  blink: 6,
  breathe: 3,
  flow: 4,
  chase: 2,
};

// UI's Speed slider is 1 (slow) - 5 (fast); firmware's setRgbSpeed takes ms/step (docs/MQTT_API.md,
// LED_RGB::setSpeed) - lower ms = faster. Linear, 30ms apart, matching the effects' suggested ranges.
const RGB_SPEED_TO_MS: Record<number, number> = {
  1: 140,
  2: 110,
  3: 80,
  4: 50,
  5: 20,
};

export function buildRgbCommands(
  state: RgbState,
): Array<{ method: string; params: Record<string, unknown> }> {
  if (!state.isOn) {
    return [{ method: "setRgbMode", params: { mode: 0 } }];
  }
  return [
    { method: "setRgbColor", params: { color: state.color } },
    {
      method: "setRgbMode",
      params: { mode: RGB_EFFECT_TO_MODE[state.effect] },
    },
    { method: "setRgbBrightness", params: { value: state.intensity } },
    {
      method: "setRgbSpeed",
      params: { value: RGB_SPEED_TO_MS[state.effectSpeed] ?? 80 },
    },
  ];
}
