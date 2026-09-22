"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Droplets, Flame, Minus, Plus, RefreshCw, Snowflake, Wind } from "lucide-react";
import type { AcMode, FanSpeed } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: AcMode; label: string; icon: typeof Snowflake; color: string }> = [
  { id: "cool", label: "Cool", icon: Snowflake, color: "#3b82f6" },
  { id: "heat", label: "Heat", icon: Flame, color: "#f97316" },
  { id: "fan", label: "Fan", icon: Wind, color: "#22c55e" },
  { id: "auto", label: "Auto", icon: RefreshCw, color: "#a855f7" },
  { id: "dry", label: "Dry", icon: Droplets, color: "#06b6d4" },
];

const FAN_SPEEDS: FanSpeed[] = ["low", "medium", "high", "auto"];

export interface AcState {
  isOn: boolean;
  acMode: AcMode;
  targetTemp: number;
  fanSpeed: FanSpeed;
  swing: boolean;
}

export function AcControlPanel({
  name,
  isOn: initialOn,
  acMode: initialMode = "cool",
  targetTemp: initialTemp = 24,
  fanSpeed: initialFanSpeed = "auto",
  swing: initialSwing = false,
  hubName,
  currentTempSlot,
  onChange,
}: {
  name: string;
  isOn: boolean;
  acMode?: AcMode;
  targetTemp?: number;
  fanSpeed?: FanSpeed;
  swing?: boolean;
  hubName?: string;
  /** What the controlling hub currently measures, shown under the setpoint. */
  currentTempSlot?: ReactNode;
  onChange?: (state: AcState) => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);
  const [acMode, setAcMode] = useState<AcMode>(initialMode);
  const [targetTemp, setTargetTemp] = useState(initialTemp);
  const [fanSpeed, setFanSpeed] = useState<FanSpeed>(initialFanSpeed);
  const [swing, setSwing] = useState(initialSwing);

  // Only report real user changes. The effect also runs on mount (and twice in StrictMode dev),
  // which would otherwise push the initial state down to the physical device just by opening
  // this screen.
  const lastReported = useRef<AcState>({
    isOn: initialOn,
    acMode: initialMode,
    targetTemp: initialTemp,
    fanSpeed: initialFanSpeed,
    swing: initialSwing,
  });
  useEffect(() => {
    const next: AcState = { isOn, acMode, targetTemp, fanSpeed, swing };
    const prev = lastReported.current;
    if (
      prev.isOn === next.isOn &&
      prev.acMode === next.acMode &&
      prev.targetTemp === next.targetTemp &&
      prev.fanSpeed === next.fanSpeed &&
      prev.swing === next.swing
    ) {
      return;
    }
    lastReported.current = next;
    onChange?.(next);
  }, [isOn, acMode, targetTemp, fanSpeed, swing]);

  const activeMode = MODES.find((m) => m.id === acMode) ?? MODES[0];
  const HeroIcon = activeMode.icon;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{name}</span>
          {hubName && (
            <span className="text-xs text-muted-foreground">via {hubName}</span>
          )}
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

      <div className="flex flex-col items-center gap-3 py-2">
        <HeroIcon
          className="size-16 transition-all"
          style={{
            color: isOn ? activeMode.color : "var(--muted-foreground)",
            filter: isOn ? `drop-shadow(0 0 22px ${activeMode.color}80)` : "none",
            opacity: isOn ? 1 : 0.4,
          }}
          strokeWidth={1.5}
        />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setTargetTemp((t) => Math.max(16, t - 1));
            }}
            disabled={!isOn}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
            aria-label="Decrease temperature"
          >
            <Minus className="size-4" />
          </button>
          <span className="text-4xl font-bold tabular-nums">{targetTemp}°</span>
          <button
            type="button"
            onClick={() => {
              setTargetTemp((t) => Math.min(30, t + 1));
            }}
            disabled={!isOn}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
            aria-label="Increase temperature"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {currentTempSlot}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">Mode</span>
        <div className="flex justify-between gap-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = acMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setAcMode(m.id);
                }}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors",
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Fan speed</span>
        <div className="flex items-center gap-1">
          {FAN_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => {
                setFanSpeed(speed);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                fanSpeed === speed
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {speed}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <span className="text-sm font-medium">Swing</span>
        <button
          type="button"
          onClick={() => {
            setSwing((v) => !v);
          }}
          className={cn(
            "h-7 min-w-14 rounded-full px-3 text-xs font-semibold transition-colors",
            swing ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {swing ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
