"use client";

import {
  Circle,
  Lightbulb,
  Rainbow,
  RotateCw,
  Thermometer,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColorWheel } from "@/components/devices/color-wheel";
import { Slider } from "@/components/ui/slider";
import type { TKey } from "@/lib/i18n";
import { type RgbEffect, SHADE_COLORS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const EFFECTS: Array<{ id: RgbEffect; labelKey: TKey; icon: typeof Circle }> = [
  { id: "solid", labelKey: "rgb.effect.solid", icon: Circle },
  { id: "blink", labelKey: "rgb.effect.blink", icon: Zap },
  { id: "breathe", labelKey: "rgb.effect.breathe", icon: Waves },
  { id: "flow", labelKey: "rgb.effect.flow", icon: Rainbow },
  { id: "chase", labelKey: "rgb.effect.chase", icon: RotateCw },
];

const EFFECT_ANIMATION: Record<RgbEffect, string | undefined> = {
  solid: undefined,
  blink: "animate-rgb-blink",
  breathe: "animate-rgb-breathe",
  flow: "animate-rgb-flow",
  chase: "animate-rgb-chase",
};

// The brightness/speed sliders (and the free-color picker below, which fires just as often while
// dragging inside its popup) call onChange repeatedly, and each report is a real MQTT publish
// (setRgbColor/setRgbMode/setRgbBrightness) — same problem/fix as ac-control-panel.tsx and
// alarm-control-panel.tsx.
const SYNC_DEBOUNCE_MS = 700;

export interface RgbState {
  isOn: boolean;
  intensity: number;
  /** Hex ("#rrggbb") — a Shades preset or anything from the free-color picker. Still sent/kept even
   * while autoTempColor is on: it's what the effect reverts to the moment autoTempColor is switched off. */
  color: string;
  effect: RgbEffect;
  effectSpeed: number;
  /** docs/MQTT_API.md setRgbMode's `autoTempColor` — an independent flag, combinable with any effect,
   * not an effect of its own: true makes the running effect use the hub's sensed room temperature for
   * color (with a flash on IR send/receive) instead of `color`. */
  autoTempColor: boolean;
}

export function RgbControlPanel({
  name,
  isOn: initialOn,
  intensity: initialIntensity = 70,
  color: initialColor = SHADE_COLORS[0],
  effect: initialEffect = "solid",
  effectSpeed: initialSpeed = 3,
  autoTempColor: initialAutoTempColor = false,
  hubName,
  onChange,
}: {
  name: string;
  isOn: boolean;
  intensity?: number;
  color?: string;
  effect?: RgbEffect;
  effectSpeed?: number;
  autoTempColor?: boolean;
  hubName?: string;
  onChange?: (state: RgbState) => void;
}) {
  const { t } = useTranslation();
  const [isOn, setIsOn] = useState(initialOn);
  const [intensity, setIntensity] = useState(initialIntensity);
  const [color, setColor] = useState(initialColor);
  const [effect, setEffect] = useState<RgbEffect>(initialEffect);
  const [speed, setSpeed] = useState(initialSpeed);
  const [autoTempColor, setAutoTempColor] = useState(initialAutoTempColor);

  // Only report real user changes — see the same note in ac-control-panel.tsx.
  const lastReported = useRef<RgbState>({
    isOn: initialOn,
    intensity: initialIntensity,
    color: initialColor,
    effect: initialEffect,
    effectSpeed: initialSpeed,
    autoTempColor: initialAutoTempColor,
  });
  const pendingSend = useRef<RgbState | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always the latest onChange, so the debounced timeout and the unmount flush below never call a
  // stale closure (they don't re-run on every render the way the effect's own deps do).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function reportNow(next: RgbState) {
    if (sendTimer.current !== null) {
      clearTimeout(sendTimer.current);
      sendTimer.current = null;
    }
    pendingSend.current = null;
    lastReported.current = next;
    onChangeRef.current?.(next);
  }

  // Discrete taps (power, effect, the auto-temp-color toggle) - report right away, same as ac-control-panel.tsx.
  useEffect(() => {
    const next: RgbState = {
      isOn,
      intensity,
      color,
      effect,
      effectSpeed: speed,
      autoTempColor,
    };
    const prev = lastReported.current;
    if (
      prev.isOn === next.isOn &&
      prev.effect === next.effect &&
      prev.autoTempColor === next.autoTempColor
    ) {
      return;
    }
    reportNow(next);
  }, [isOn, effect, autoTempColor]);

  // Brightness/speed sliders and the color picker all fire onChange repeatedly while being dragged,
  // each a real MQTT publish - debounce to one send per pause (still flushed on unmount below if the
  // panel goes away mid-drag). A Shades preset tap goes through here too — one extra debounce tick
  // is not worth a third code path.
  useEffect(() => {
    const next: RgbState = {
      isOn,
      intensity,
      color,
      effect,
      effectSpeed: speed,
      autoTempColor,
    };
    const prev = lastReported.current;
    if (
      prev.intensity === next.intensity &&
      prev.color === next.color &&
      prev.effectSpeed === next.effectSpeed
    ) {
      return;
    }

    pendingSend.current = next;
    if (sendTimer.current !== null) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      sendTimer.current = null;
      reportNow(next);
    }, SYNC_DEBOUNCE_MS);
  }, [intensity, color, speed]);

  // Flush a still-pending edit if the panel unmounts before the debounce fires (e.g. the user drags
  // brightness then immediately taps another device chip) instead of silently dropping it.
  useEffect(
    () => () => {
      if (sendTimer.current === null) return;
      clearTimeout(sendTimer.current);
      if (pendingSend.current) onChangeRef.current?.(pendingSend.current);
    },
    [],
  );
  const animationClass = isOn ? EFFECT_ANIMATION[effect] : undefined;
  const animationDuration =
    effect === "flow" ? 6.4 - speed * 0.8 : 6 - speed * 0.9;
  // While autoTempColor is on, the effect's real color comes from the hub's temperature sensor, not
  // `color` — show a neutral "auto" tint instead of a swatch the app never actually applied.
  const previewColor = autoTempColor ? "#f59e0b" : color;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{name}</span>
          {hubName && (
            <span className="text-xs text-muted-foreground">
              {t("device.via", { hub: hubName })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOn((v) => !v);
          }}
          className={cn(
            "h-7 min-w-14 rounded-full px-3 text-xs font-semibold uppercase transition-colors",
            isOn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isOn ? t("common.on") : t("common.off")}
        </button>
      </div>

      <div className="flex items-center justify-center py-4">
        <Lightbulb
          className={cn("size-24", animationClass)}
          style={{
            color: isOn ? previewColor : "var(--muted-foreground)",
            filter:
              isOn && effect !== "flow"
                ? `drop-shadow(0 0 26px ${previewColor}80)`
                : undefined,
            opacity: !isOn
              ? 0.4
              : effect === "blink" || effect === "breathe"
                ? undefined
                : 1,
            animationDuration: animationClass
              ? `${animationDuration}s`
              : undefined,
          }}
          strokeWidth={1.5}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t("rgb.effectLabel")}
        </span>
        <div className="flex items-center gap-1">
          {EFFECTS.map((fx) => {
            const Icon = fx.icon;
            const active = effect === fx.id;
            return (
              <button
                key={fx.id}
                type="button"
                onClick={() => {
                  setEffect(fx.id);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {t(fx.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Thermometer className="size-3.5" />
            {t("rgb.autoTempColor")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("rgb.autoTempColorHint")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setAutoTempColor((v) => !v);
          }}
          disabled={!isOn}
          className={cn(
            "h-7 min-w-14 shrink-0 rounded-full px-3 text-xs font-semibold uppercase transition-colors disabled:opacity-40",
            autoTempColor
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {autoTempColor ? t("common.on") : t("common.off")}
        </button>
      </div>

      {effect !== "solid" && (
        <div className="flex flex-col gap-3">
          <span className="text-sm text-muted-foreground">
            {t("rgb.speed")}
          </span>
          <Slider
            value={[speed]}
            onValueChange={(value: number | readonly number[]) => {
              setSpeed(typeof value === "number" ? value : value[0]);
            }}
            min={1}
            max={5}
            step={1}
            disabled={!isOn}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">
          {t("rgb.brightness")}
        </span>
        <Slider
          value={[intensity]}
          onValueChange={(value: number | readonly number[]) => {
            setIntensity(typeof value === "number" ? value : value[0]);
          }}
          max={100}
          step={1}
          disabled={!isOn}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t("rgb.color")}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {color.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-center py-1">
          <ColorWheel
            color={color}
            disabled={!isOn}
            onChange={(next) => {
              setColor(next);
            }}
          />
        </div>
        <div className="grid grid-cols-6 gap-3">
          {SHADE_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
              }}
              aria-label={t("device.shade", { n: i + 1 })}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                color === c && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {autoTempColor && (
          <p className="rounded-xl bg-muted px-3.5 py-3 text-xs text-muted-foreground">
            {t("rgb.autoTempNote")}
          </p>
        )}
      </div>
    </div>
  );
}
