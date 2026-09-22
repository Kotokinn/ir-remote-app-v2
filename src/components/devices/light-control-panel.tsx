"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { SHADE_COLORS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const MODES = ["morning", "day", "night"] as const;

export interface LightState {
  isOn: boolean;
  mode: (typeof MODES)[number];
  intensity: number;
  colorIndex: number;
}

export function LightControlPanel({
  icon: Icon,
  name,
  isOn: initialOn,
  mode: initialMode = "day",
  intensity: initialIntensity = 50,
  colorIndex: initialColorIndex = 3,
  onChange,
}: {
  icon: LucideIcon;
  name: string;
  isOn: boolean;
  mode?: (typeof MODES)[number];
  intensity?: number;
  colorIndex?: number;
  onChange?: (state: LightState) => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);
  const [mode, setMode] = useState<(typeof MODES)[number]>(initialMode);
  const [intensity, setIntensity] = useState(initialIntensity);
  const [colorIndex, setColorIndex] = useState(initialColorIndex);
  const color = SHADE_COLORS[colorIndex];

  useEffect(() => {
    onChange?.({ isOn, mode, intensity, colorIndex });
  }, [isOn, mode, intensity, colorIndex]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">{name}</span>
        <button
          type="button"
          onClick={() => { setIsOn((v) => !v); }}
          className={cn(
            "h-7 min-w-14 rounded-full px-3 text-xs font-semibold transition-colors",
            isOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {isOn ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex items-center justify-center py-4">
        <Icon
          className="size-24 transition-all"
          style={{
            color: isOn ? color : "var(--muted-foreground)",
            filter: isOn ? `drop-shadow(0 0 26px ${color}80)` : "none",
            opacity: isOn ? 1 : 0.4,
          }}
          strokeWidth={1.5}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Mode</span>
        <div className="flex items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">Intensity</span>
        <Slider
          value={[intensity]}
          onValueChange={(value: number | readonly number[]) => {
            const next = typeof value === "number" ? value : value[0];
            setIntensity(next);
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
              onClick={() => { setColorIndex(i); }}
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
