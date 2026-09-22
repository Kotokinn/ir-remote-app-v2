"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// The native time input fires onChange repeatedly while scrubbing/typing, and each report is a real
// MQTT publish (setSchedule) — without this, moving the clock spams the hub. Debounce to one send
// per pause, but still flush a pending edit immediately if the panel goes away mid-edit (switching
// device chip, leaving the screen) so it is never silently dropped.
const SYNC_DEBOUNCE_MS = 700;

function statesEqual(a: AlarmState, b: AlarmState): boolean {
  return (
    a.isOn === b.isOn &&
    a.alarmTime === b.alarmTime &&
    a.alarmDays.length === b.alarmDays.length &&
    a.alarmDays.every((day, i) => day === b.alarmDays[i])
  );
}

export interface AlarmState {
  isOn: boolean;
  alarmTime: string;
  alarmDays: string[];
}

export function AlarmControlPanel({
  name,
  isOn: initialOn,
  alarmTime: initialTime = "07:00",
  alarmDays: initialDays = [],
  hubName,
  onChange,
}: {
  name: string;
  isOn: boolean;
  alarmTime?: string;
  alarmDays?: string[];
  hubName?: string;
  onChange?: (state: AlarmState) => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);
  const [time, setTime] = useState(initialTime);
  const [days, setDays] = useState<number[]>(
    initialDays.length ? initialDays.map(Number) : [0, 1, 2, 3, 4]
  );

  function toggleDay(index: number) {
    setDays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    );
  }

  // Only report real user changes — see ac-control-panel.tsx for why (mount / StrictMode double-run).
  const lastReported = useRef<AlarmState>({
    isOn: initialOn,
    alarmTime: initialTime,
    alarmDays: [...initialDays].sort(),
  });
  const pendingSend = useRef<AlarmState | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always the latest onChange, so the debounced timeout and the unmount flush below never call a
  // stale closure (they don't re-run on every render the way the effect's own deps do).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const next: AlarmState = { isOn, alarmTime: time, alarmDays: days.map(String).sort() };
    if (statesEqual(lastReported.current, next)) return;

    pendingSend.current = next;
    if (sendTimer.current !== null) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      lastReported.current = next;
      pendingSend.current = null;
      sendTimer.current = null;
      onChangeRef.current?.(next);
    }, SYNC_DEBOUNCE_MS);
  }, [isOn, time, days]);

  // Flush a still-pending edit if the panel unmounts before the debounce fires (e.g. the user picks
  // a time then immediately taps another device chip) instead of silently dropping it.
  useEffect(
    () => () => {
      if (sendTimer.current === null) return;
      clearTimeout(sendTimer.current);
      if (pendingSend.current) onChangeRef.current?.(pendingSend.current);
    },
    []
  );

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

      <div className="flex flex-col items-center gap-3 py-4">
        <AlarmClock
          className="size-14"
          style={{
            color: isOn ? "var(--primary)" : "var(--muted-foreground)",
            opacity: isOn ? 1 : 0.4,
          }}
          strokeWidth={1.5}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
          }}
          className="rounded-lg bg-muted px-4 py-2 text-3xl font-bold outline-none"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="text-sm text-muted-foreground">Repeat</span>
        <div className="flex gap-2">
          {WEEKDAYS.map((day, i) => (
            <button
              key={`${day}-${i}`}
              type="button"
              onClick={() => {
                toggleDay(i);
              }}
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                days.includes(i)
                  ? "bg-brand-gradient text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {day}
            </button>
          ))}
        </div>
        {days.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            No repeat days selected — this alarm won&apos;t ring.
          </p>
        )}
      </div>
    </div>
  );
}
