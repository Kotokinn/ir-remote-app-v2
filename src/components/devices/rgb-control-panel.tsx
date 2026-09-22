"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Lightbulb, Rainbow, RotateCw, Waves, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { ColorWheel } from "@/components/devices/color-wheel";
import { SHADE_COLORS, type RgbEffect } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const EFFECTS: Array<{ id: RgbEffect; label: string; icon: typeof Circle }> = [
  { id: "solid", label: "Solid", icon: Circle },
  { id: "blink", label: "Blink", icon: Zap },
  { id: "breathe", label: "Breathe", icon: Waves },
  { id: "flow", label: "Flow", icon: Rainbow },
  { id: "chase", label: "Chase", icon: RotateCw },
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
  /** Hex ("#rrggbb") — a Shades preset or anything from the free-color picker. */
  color: string;
  effect: RgbEffect;
  effectSpeed: number;
}

export function RgbControlPanel({
  name,
  isOn: initialOn,
  intensity: initialIntensity = 70,
  color: initialColor = SHADE_COLORS[0],
  effect: initialEffect = "solid",
  effectSpeed: initialSpeed = 3,
  hubName,
  onChange,
}: {
  name: string;
  isOn: boolean;
  intensity?: number;
  color?: string;
  effect?: RgbEffect;
  effectSpeed?: number;
  hubName?: string;
  onChange?: (state: RgbState) => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);
  const [intensity, setIntensity] = useState(initialIntensity);
  const [color, setColor] = useState(initialColor);
  const [effect, setEffect] = useState<RgbEffect>(initialEffect);
  const [speed, setSpeed] = useState(initialSpeed);

  // Only report real user changes — see the same note in ac-control-panel.tsx.
  const lastReported = useRef<RgbState>({
    isOn: initialOn,
    intensity: initialIntensity,
    color: initialColor,
    effect: initialEffect,
    effectSpeed: initialSpeed,
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

  // Discrete taps (power, effect) - report right away, same as ac-control-panel.tsx.
  useEffect(() => {
    const next: RgbState = { isOn, intensity, color, effect, effectSpeed: speed };
    const prev = lastReported.current;
    if (prev.isOn === next.isOn && prev.effect === next.effect) {
      return;
    }
    reportNow(next);
  }, [isOn, effect]);

  // Brightness/speed sliders and the color picker all fire onChange repeatedly while being dragged,
  // each a real MQTT publish - debounce to one send per pause (still flushed on unmount below if the
  // panel goes away mid-drag). A Shades preset tap goes through here too — one extra debounce tick
  // is not worth a third code path.
  useEffect(() => {
    const next: RgbState = { isOn, intensity, color, effect, effectSpeed: speed };
    const prev = lastReported.current;
    if (prev.intensity === next.intensity && prev.color === next.color && prev.effectSpeed === next.effectSpeed) {
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
    []
  );
  const animationClass = isOn ? EFFECT_ANIMATION[effect] : undefined;
  const animationDuration = effect === "flow" ? 6.4 - speed * 0.8 : 6 - speed * 0.9;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{name}</span>
          {hubName && <span className="text-xs text-muted-foreground">via {hubName}</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOn((v) => !v);
          }}
          className={cn(
            "h-7 min-w-14 rounded-full px-3 text-xs font-semibold transition-colors",
            isOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {isOn ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex items-center justify-center py-4">
        <Lightbulb
          className={cn("size-24", animationClass)}
          style={{
            color: isOn ? color : "var(--muted-foreground)",
            filter: isOn && effect !== "flow" ? `drop-shadow(0 0 26px ${color}80)` : undefined,
            opacity: !isOn ? 0.4 : effect === "blink" || effect === "breathe" ? undefined : 1,
            animationDuration: animationClass ? `${animationDuration}s` : undefined,
          }}
          strokeWidth={1.5}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Effect</span>
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
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                {fx.label}
              </button>
            );
          })}
        </div>
      </div>

      {effect !== "solid" && (
        <div className="flex flex-col gap-3">
          <span className="text-sm text-muted-foreground">Speed</span>
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
        <span className="text-sm text-muted-foreground">Brightness</span>
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
          <span className="text-sm text-muted-foreground">Color</span>
          <span className="text-xs tabular-nums text-muted-foreground">{color.toUpperCase()}</span>
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
              aria-label={`Shade ${i + 1}`}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                color === c && "ring-2 ring-foreground"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
