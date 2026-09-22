"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Lightbulb, Rainbow, Waves, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { SHADE_COLORS, type RgbEffect } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const EFFECTS: Array<{ id: RgbEffect; label: string; icon: typeof Circle }> = [
  { id: "solid", label: "Solid", icon: Circle },
  { id: "blink", label: "Blink", icon: Zap },
  { id: "breathe", label: "Breathe", icon: Waves },
  { id: "flow", label: "Flow", icon: Rainbow },
];

const EFFECT_ANIMATION: Record<RgbEffect, string | undefined> = {
  solid: undefined,
  blink: "animate-rgb-blink",
  breathe: "animate-rgb-breathe",
  flow: "animate-rgb-flow",
};

export interface RgbState {
  isOn: boolean;
  intensity: number;
  colorIndex: number;
  effect: RgbEffect;
  effectSpeed: number;
}

export function RgbControlPanel({
  name,
  isOn: initialOn,
  intensity: initialIntensity = 70,
  colorIndex: initialColorIndex = 0,
  effect: initialEffect = "solid",
  effectSpeed: initialSpeed = 3,
  hubName,
  onChange,
}: {
  name: string;
  isOn: boolean;
  intensity?: number;
  colorIndex?: number;
  effect?: RgbEffect;
  effectSpeed?: number;
  hubName?: string;
  onChange?: (state: RgbState) => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);
  const [intensity, setIntensity] = useState(initialIntensity);
  const [colorIndex, setColorIndex] = useState(initialColorIndex);
  const [effect, setEffect] = useState<RgbEffect>(initialEffect);
  const [speed, setSpeed] = useState(initialSpeed);
  const color = SHADE_COLORS[colorIndex];

  // Only report real user changes — see the same note in ac-control-panel.tsx.
  const lastReported = useRef<RgbState>({
    isOn: initialOn,
    intensity: initialIntensity,
    colorIndex: initialColorIndex,
    effect: initialEffect,
    effectSpeed: initialSpeed,
  });
  useEffect(() => {
    const next: RgbState = { isOn, intensity, colorIndex, effect, effectSpeed: speed };
    const prev = lastReported.current;
    if (
      prev.isOn === next.isOn &&
      prev.intensity === next.intensity &&
      prev.colorIndex === next.colorIndex &&
      prev.effect === next.effect &&
      prev.effectSpeed === next.effectSpeed
    ) {
      return;
    }
    lastReported.current = next;
    onChange?.(next);
  }, [isOn, intensity, colorIndex, effect, speed]);
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
        <span className="text-sm text-muted-foreground">Shades</span>
        <div className="grid grid-cols-6 gap-3">
          {SHADE_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColorIndex(i);
              }}
              aria-label={`Shade ${i + 1}`}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                colorIndex === i && "ring-2 ring-foreground"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
