"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  Pencil,
  Plus,
  Trash2,
  Lightbulb,
  Lamp,
  Sun,
  Blinds,
  Lock,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { SCHEDULES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const DEFAULT_DEVICES: Array<{ id: string; name: string; icon: LucideIcon }> = [
  { id: "d1", name: "Bedroom bulb", icon: Lightbulb },
  { id: "d2", name: "Bedlamp", icon: Lamp },
  { id: "d3", name: "Dimmer", icon: Sun },
  { id: "d4", name: "Hall wall light", icon: Lightbulb },
  { id: "d5", name: "Front door lock", icon: Lock },
  { id: "d6", name: "Thermostat", icon: Thermometer },
];

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function NewAutomationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind = searchParams.get("type") === "scene" ? "scene" : "schedule";
  const scheduleId = searchParams.get("id");
  const existing = useMemo(
    () => SCHEDULES.find((s) => s.id === scheduleId),
    [scheduleId]
  );

  const [name, setName] = useState(existing?.name ?? (kind === "scene" ? "New scene" : "New schedule"));
  const [section, setSection] = useState<"devices" | "timing">("devices");
  const [devices, setDevices] = useState(DEFAULT_DEVICES);
  const [startAt, setStartAt] = useState("08:00");
  const [endAt, setEndAt] = useState("09:00");
  const [activeDays, setActiveDays] = useState<number[]>([0, 3, 5]);
  const [repeatWeekly, setRepeatWeekly] = useState(true);

  function toggleDay(index: number) {
    setActiveDays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { router.back(); }}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => { router.back(); }}
          className="text-sm font-semibold text-primary"
        >
          Save
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <Pencil className="size-4 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        {(["devices", "timing"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setSection(s); }}
            className={cn(
              "h-9 rounded-lg text-sm font-semibold capitalize transition-colors",
              section === s
                ? "bg-brand-gradient text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {section === "devices" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Add devices and change their attributes according to your workflow.
            </p>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70"
              aria-label="Add device"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {devices.map((device) => {
              const Icon = device.icon;
              return (
                <div key={device.id} className="flex items-center gap-3 py-3">
                  <Icon className="size-4 text-primary" />
                  <span className="flex-1 truncate text-sm">{device.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      { setDevices((prev) => prev.filter((d) => d.id !== device.id)); }
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${device.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-muted-foreground">
            Setting a schedule automatically changes the attributes of devices in
            that workflow.
          </p>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Start at</span>
            <input
              type="time"
              value={startAt}
              onChange={(e) => { setStartAt(e.target.value); }}
              className="rounded-lg bg-muted px-3 py-1.5 text-lg font-semibold outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">End at</span>
            <input
              type="time"
              value={endAt}
              onChange={(e) => { setEndAt(e.target.value); }}
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
                  onClick={() => { toggleDay(i); }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    activeDays.includes(i)
                      ? "bg-brand-gradient text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={repeatWeekly}
                onChange={(e) => { setRepeatWeekly(e.target.checked); }}
                className="size-4 rounded accent-[var(--primary)]"
              />
              Repeat Weekly
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewAutomationPage() {
  return (
    <Suspense fallback={null}>
      <NewAutomationClient />
    </Suspense>
  );
}
