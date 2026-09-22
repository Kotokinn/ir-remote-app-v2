// Maps the UI's generic device concepts to the device's real command vocabulary
// (docs/MQTT_API.md section 4 — sendAc / setRgbColor / setRgbMode). Only AC and RGB
// map cleanly to a real command today; "light" (morning/day/night) and "alarm" have no
// matching method in the doc yet, so they stay UI-only until the doc/firmware define one.
import type { AcState } from "@/components/devices/ac-control-panel";
import type { RgbState } from "@/components/devices/rgb-control-panel";
import { resolveAcProtocol } from "@/lib/device/ac-brands";
import { SHADE_COLORS, type AcMode, type RgbEffect } from "@/lib/mock-data";

const AC_MODE_TO_INT: Record<AcMode, number> = {
  auto: 0,
  cool: 1,
  heat: 2,
  dry: 3,
  fan: 4,
};

const FAN_SPEED_TO_INT: Record<AcState["fanSpeed"], number> = {
  auto: 0,
  low: 1,
  medium: 2,
  high: 3,
};

// doc's swing is a richer 0-7 enum (off/auto/highest/high/middle/low/lowest/upperMiddle);
// the UI only has an on/off toggle today, so it collapses to off(0)/auto(1).
function swingToInt(swing: boolean): number {
  return swing ? 1 : 0;
}

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

export function buildSendAcCommand(brandOrProtocol: string, state: AcState): SendAcCommand {
  return {
    method: "sendAc",
    params: {
      protocol: resolveAcProtocol(brandOrProtocol),
      power: state.isOn,
      temp: state.targetTemp,
      mode: AC_MODE_TO_INT[state.acMode],
      fan: FAN_SPEED_TO_INT[state.fanSpeed],
      swing: swingToInt(state.swing),
    },
  };
}

// docs/MQTT_API.md setRgbMode: 0=OFF,1=STATIC,2=ROTATING,3=BREATHING,4=WAVE,5=RAINBOW,
// 6=STROBE,7=SPARKLE,8=CONFETTI,9=POLICE,10=COLOR_WIPE,11=FIRE. The UI only offers 4
// effects today — each maps to the closest real mode.
const RGB_EFFECT_TO_MODE: Record<RgbEffect, number> = {
  solid: 1,
  blink: 6,
  breathe: 3,
  flow: 4,
};

export function buildRgbCommands(state: RgbState): Array<{ method: string; params: Record<string, unknown> }> {
  if (!state.isOn) {
    return [{ method: "setRgbMode", params: { mode: 0 } }];
  }
  return [
    { method: "setRgbColor", params: { color: SHADE_COLORS[state.colorIndex] ?? SHADE_COLORS[0] } },
    { method: "setRgbMode", params: { mode: RGB_EFFECT_TO_MODE[state.effect] } },
  ];
}
