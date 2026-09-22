"use client";

import { useState } from "react";
import type { Device } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function newDeviceId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AlarmSetup({
  roomId,
  hubId,
  onDone,
}: {
  roomId: string;
  hubId: string;
  onDone: (device: Device) => void;
}) {
  const [name, setName] = useState("");
  const [time, setTime] = useState("07:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);

  function toggleDay(index: number) {
    setDays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    );
  }

  function finish() {
    onDone({
      id: newDeviceId(),
      name: name.trim() || "Alarm",
      roomId,
      categoryId: "alarm",
      isOn: true,
      kind: "alarm",
      hubId,
      alarmTime: time,
      alarmDays: days.map(String),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="e.g. Wake up alarm"
          autoFocus
          className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Time</span>
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
          }}
          className="rounded-lg bg-muted px-3 py-1.5 text-lg font-semibold outline-none"
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

      <button
        type="button"
        disabled={!name.trim()}
        onClick={finish}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
      >
        Finish
      </button>
    </div>
  );
}
