"use client";

import { useState } from "react";
import { AlarmClock } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function AlarmControlPanel({
  name,
  isOn: initialOn,
  alarmTime: initialTime = "07:00",
  alarmDays: initialDays = [],
  hubName,
}: {
  name: string;
  isOn: boolean;
  alarmTime?: string;
  alarmDays?: string[];
  hubName?: string;
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
      </div>
    </div>
  );
}
