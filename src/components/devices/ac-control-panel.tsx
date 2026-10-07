"use client";

import {
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Droplets,
  Flame,
  Minus,
  Moon,
  MoveVertical,
  Plus,
  RefreshCw,
  Snowflake,
  Wind,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TKey } from "@/lib/i18n";
import type {
  AcMode,
  AcSleepSubject,
  AcSwing,
  FanSpeed,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// The native wake-time input fires onChange repeatedly while scrubbing/typing, and each report is a
// real MQTT publish (setSleepMode) — see alarm-control-panel.tsx for the same problem/fix.
const SLEEP_DEBOUNCE_MS = 700;

const SLEEP_SUBJECTS: Array<{ id: AcSleepSubject; labelKey: TKey }> = [
  { id: "child", labelKey: "ac.subject.child" },
  { id: "adult", labelKey: "ac.subject.adult" },
  { id: "elder", labelKey: "ac.subject.elder" },
];

// docs/MQTT_API.md setSleepMode: firmware default sleep temperature when `targetTemp` is omitted.
const SLEEP_DEFAULT_TEMP: Record<AcSleepSubject, number> = {
  child: 27,
  adult: 25,
  elder: 27,
};

export interface SleepState {
  enabled: boolean;
  subject: AcSleepSubject;
  wakeTime: string;
  /** °C, 16-30; undefined = let the firmware use SLEEP_DEFAULT_TEMP for `subject`. */
  targetTemp?: number;
}

function sleepStatesEqual(a: SleepState, b: SleepState): boolean {
  return (
    a.enabled === b.enabled &&
    a.subject === b.subject &&
    a.wakeTime === b.wakeTime &&
    a.targetTemp === b.targetTemp
  );
}

const MODES: Array<{
  id: AcMode;
  labelKey: TKey;
  icon: typeof Snowflake;
  color: string;
}> = [
  { id: "cool", labelKey: "ac.mode.cool", icon: Snowflake, color: "#3b82f6" },
  { id: "heat", labelKey: "ac.mode.heat", icon: Flame, color: "#f97316" },
  { id: "fan", labelKey: "ac.mode.fan", icon: Wind, color: "#22c55e" },
  { id: "auto", labelKey: "ac.mode.auto", icon: RefreshCw, color: "#a855f7" },
  { id: "dry", labelKey: "ac.mode.dry", icon: Droplets, color: "#06b6d4" },
];

// Order matches the firmware's ascending speed enum (auto=0, low=1, min=2, medium=3, high=4, max=5).
const FAN_SPEEDS: FanSpeed[] = ["auto", "low", "min", "medium", "high", "max"];

// Vertical swing (louver up/down) — there is no horizontal swing control here. One button, like the
// physical remote's own Swing button: each press steps to the next position in this order and
// wraps back to the start, rather than picking from 4 spelled-out options. The icon shows the
// louver angle at a glance (chevrons pointing to where it's aimed; a moving arrow for "auto", since
// that position sweeps continuously instead of holding still).
const SWING_SEQUENCE: Array<{
  id: AcSwing;
  labelKey: TKey;
  icon: typeof ChevronsUp;
}> = [
  { id: "highest", labelKey: "ac.swing.highest", icon: ChevronsUp },
  { id: "high", labelKey: "ac.swing.high", icon: ChevronUp },
  { id: "upperMiddle", labelKey: "ac.swing.upperMiddle", icon: ArrowUp },
  { id: "middle", labelKey: "ac.swing.middle", icon: Minus },
  { id: "low", labelKey: "ac.swing.low", icon: ChevronDown },
  { id: "lowest", labelKey: "ac.swing.lowest", icon: ChevronsDown },
  { id: "auto", labelKey: "ac.swing.auto", icon: MoveVertical },
];

function nextSwing(current: AcSwing): AcSwing {
  const index = SWING_SEQUENCE.findIndex((option) => option.id === current);
  return SWING_SEQUENCE[(index + 1) % SWING_SEQUENCE.length].id;
}

function swingOption(swing: AcSwing) {
  return (
    SWING_SEQUENCE.find((option) => option.id === swing) ?? SWING_SEQUENCE[0]
  );
}

export interface AcState {
  isOn: boolean;
  acMode: AcMode;
  targetTemp: number;
  fanSpeed: FanSpeed;
  /** Vertical swing (louver up/down), not horizontal. */
  swing: AcSwing;
}

export function AcControlPanel({
  name,
  isOn: initialOn,
  acMode: initialMode = "cool",
  targetTemp: initialTemp = 24,
  fanSpeed: initialFanSpeed = "auto",
  swing: initialSwing = "auto",
  sleepEnabled: initialSleepEnabled = false,
  sleepSubject: initialSleepSubject = "adult",
  sleepWakeTime: initialSleepWakeTime = "06:00",
  sleepTargetTemp: initialSleepTargetTemp,
  hubName,
  currentTempSlot,
  onChange,
  onSleepChange,
}: {
  name: string;
  isOn: boolean;
  acMode?: AcMode;
  targetTemp?: number;
  fanSpeed?: FanSpeed;
  swing?: AcSwing;
  sleepEnabled?: boolean;
  sleepSubject?: AcSleepSubject;
  sleepWakeTime?: string;
  sleepTargetTemp?: number;
  hubName?: string;
  /** What the controlling hub currently measures, shown under the setpoint. */
  currentTempSlot?: ReactNode;
  onChange?: (state: AcState) => void;
  onSleepChange?: (state: SleepState) => void;
}) {
  const { t } = useTranslation();
  const [isOn, setIsOn] = useState(initialOn);
  const [acMode, setAcMode] = useState<AcMode>(initialMode);
  const [targetTemp, setTargetTemp] = useState(initialTemp);
  const [fanSpeed, setFanSpeed] = useState<FanSpeed>(initialFanSpeed);
  const [swing, setSwing] = useState<AcSwing>(initialSwing);
  const [sleepEnabled, setSleepEnabled] = useState(initialSleepEnabled);
  const [sleepSubject, setSleepSubject] =
    useState<AcSleepSubject>(initialSleepSubject);
  const [sleepWakeTime, setSleepWakeTime] = useState(initialSleepWakeTime);
  const [sleepTargetTemp, setSleepTargetTemp] = useState<number | undefined>(
    initialSleepTargetTemp,
  );

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
    // docs/MQTT_API.md setSleepMode: any manual sendAc (which this onChange triggers) cancels sleep
    // mode on the device by itself. Clear it here too so the UI doesn't keep showing "Sleep ON"
    // after the hub has already dropped it — sending the matching setSleepMode:false below is
    // redundant with the device's own auto-cancel, but harmless, and keeps the two in sync even if
    // that auto-cancel behavior ever turns out to have edge cases.
    if (sleepEnabled) setSleepEnabled(false);
  }, [isOn, acMode, targetTemp, fanSpeed, swing, sleepEnabled]);

  // Only report real user changes, debounced (the wake-time input fires repeatedly while scrubbing)
  // — see alarm-control-panel.tsx for the identical pattern, including the unmount flush below.
  const lastReportedSleep = useRef<SleepState>({
    enabled: initialSleepEnabled,
    subject: initialSleepSubject,
    wakeTime: initialSleepWakeTime,
    targetTemp: initialSleepTargetTemp,
  });
  const pendingSleepSend = useRef<SleepState | null>(null);
  const sleepSendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSleepChangeRef = useRef(onSleepChange);
  onSleepChangeRef.current = onSleepChange;

  useEffect(() => {
    const next: SleepState = {
      enabled: sleepEnabled,
      subject: sleepSubject,
      wakeTime: sleepWakeTime,
      targetTemp: sleepTargetTemp,
    };
    if (sleepStatesEqual(lastReportedSleep.current, next)) return;

    pendingSleepSend.current = next;
    if (sleepSendTimer.current !== null) clearTimeout(sleepSendTimer.current);
    sleepSendTimer.current = setTimeout(() => {
      lastReportedSleep.current = next;
      pendingSleepSend.current = null;
      sleepSendTimer.current = null;
      onSleepChangeRef.current?.(next);
    }, SLEEP_DEBOUNCE_MS);
  }, [sleepEnabled, sleepSubject, sleepWakeTime, sleepTargetTemp]);

  useEffect(
    () => () => {
      if (sleepSendTimer.current === null) return;
      clearTimeout(sleepSendTimer.current);
      if (pendingSleepSend.current)
        onSleepChangeRef.current?.(pendingSleepSend.current);
    },
    [],
  );

  const activeMode = MODES.find((m) => m.id === acMode) ?? MODES[0];
  const HeroIcon = activeMode.icon;
  const currentSwing = swingOption(swing);
  const SwingIcon = currentSwing.icon;

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
          aria-label={t("device.power")}
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

      <div className="flex flex-col items-center gap-3 py-2">
        <HeroIcon
          className="size-16 transition-all"
          style={{
            color: isOn ? activeMode.color : "var(--muted-foreground)",
            filter: isOn
              ? `drop-shadow(0 0 22px ${activeMode.color}80)`
              : "none",
            opacity: isOn ? 1 : 0.4,
          }}
          strokeWidth={1.5}
        />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setTargetTemp((temp) => Math.max(16, temp - 1));
            }}
            disabled={!isOn}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
            aria-label={t("ac.decreaseTemp")}
          >
            <Minus className="size-4" />
          </button>
          <span className="text-4xl font-bold tabular-nums">{targetTemp}°</span>
          <button
            type="button"
            onClick={() => {
              setTargetTemp((temp) => Math.min(30, temp + 1));
            }}
            disabled={!isOn}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
            aria-label={t("ac.increaseTemp")}
          >
            <Plus className="size-4" />
          </button>
        </div>
        {currentTempSlot}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">
          {t("ac.modeLabel")}
        </span>
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
                  active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {t(m.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">
          {t("ac.fanSpeed")}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {FAN_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => {
                setFanSpeed(speed);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                fanSpeed === speed
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`ac.fan.${speed}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("ac.swingVertical")}</span>
        </div>
        <button
          type="button"
          aria-label={t("ac.swingButton")}
          onClick={() => {
            setSwing(nextSwing);
          }}
          className="flex h-7 min-w-24 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors"
        >
          <SwingIcon className="size-3.5" />
          {t(currentSwing.labelKey)}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("ac.sleepMode")}</span>
          </div>
          <button
            type="button"
            aria-label={t("ac.sleepMode")}
            onClick={() => {
              setSleepEnabled((v) => !v);
            }}
            disabled={!isOn}
            className={cn(
              "h-7 min-w-14 rounded-full px-3 text-xs font-semibold uppercase transition-colors disabled:opacity-40",
              sleepEnabled
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sleepEnabled ? t("common.on") : t("common.off")}
          </button>
        </div>

        <div
          className={cn(
            "flex flex-col gap-3",
            (!isOn || !sleepEnabled) && "opacity-40",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("ac.sleepFor")}
            </span>
            <div className="flex gap-1">
              {SLEEP_SUBJECTS.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  disabled={!isOn || !sleepEnabled}
                  onClick={() => {
                    setSleepSubject(subject.id);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    sleepSubject === subject.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t(subject.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("ac.wakeAt")}
            </span>
            <input
              type="time"
              value={sleepWakeTime}
              disabled={!isOn || !sleepEnabled}
              onChange={(e) => {
                setSleepWakeTime(e.target.value);
              }}
              className="rounded-lg bg-muted px-3 py-1 text-sm font-semibold outline-none disabled:opacity-40"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("ac.targetTemp")}
            </span>
            {sleepTargetTemp === undefined ? (
              <button
                type="button"
                disabled={!isOn || !sleepEnabled}
                onClick={() => {
                  setSleepTargetTemp(SLEEP_DEFAULT_TEMP[sleepSubject]);
                }}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground disabled:opacity-40"
              >
                {t("ac.defaultTemp", {
                  temp: SLEEP_DEFAULT_TEMP[sleepSubject],
                })}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isOn || !sleepEnabled}
                  onClick={() => {
                    setSleepTargetTemp((temp) =>
                      Math.max(
                        16,
                        (temp ?? SLEEP_DEFAULT_TEMP[sleepSubject]) - 1,
                      ),
                    );
                  }}
                  className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
                  aria-label={t("ac.decreaseSleepTemp")}
                >
                  <Minus className="size-3" />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                  {sleepTargetTemp}°
                </span>
                <button
                  type="button"
                  disabled={!isOn || !sleepEnabled}
                  onClick={() => {
                    setSleepTargetTemp((temp) =>
                      Math.min(
                        30,
                        (temp ?? SLEEP_DEFAULT_TEMP[sleepSubject]) + 1,
                      ),
                    );
                  }}
                  className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
                  aria-label={t("ac.increaseSleepTemp")}
                >
                  <Plus className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={!isOn || !sleepEnabled}
                  onClick={() => {
                    setSleepTargetTemp(undefined);
                  }}
                  className="text-xs font-medium text-muted-foreground underline disabled:opacity-40"
                >
                  {t("ac.reset")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
