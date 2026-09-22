"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ScheduleFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduleId = searchParams.get("id");
  const scenes = useScenesStore((s) => s.scenes);
  const addSchedule = useSchedulesStore((s) => s.addSchedule);
  const updateSchedule = useSchedulesStore((s) => s.updateSchedule);
  const existing = useSchedulesStore((s) => s.schedules.find((sc) => sc.id === scheduleId));

  const [name, setName] = useState(existing?.name ?? "New schedule");
  const [sceneId, setSceneId] = useState(existing?.sceneId ?? scenes.at(0)?.id ?? "");
  const [startAt, setStartAt] = useState(existing?.startAt ?? "08:00");
  const [hasEnd, setHasEnd] = useState(existing?.hasEnd ?? false);
  const [endAt, setEndAt] = useState(existing?.endAt ?? "09:00");
  const [days, setDays] = useState<number[]>(existing?.days ?? [0, 1, 2, 3, 4]);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(index: number) {
    setDays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    );
  }

  async function save() {
    const payload = {
      name: name.trim() || "Schedule",
      sceneId,
      startAt,
      days,
      hasEnd,
      endAt: hasEnd ? endAt : undefined,
      enabled,
    };
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await updateSchedule(existing.id, payload);
      } else {
        await addSchedule(payload);
      }
      router.push("/automation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
      setSaving(false);
    }
  }

  if (scenes.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 pt-16 text-center lg:px-8">
        <p className="text-sm font-medium">You need a scene first</p>
        <p className="text-xs text-muted-foreground">
          Schedules run an existing scene at a set time — create one first.
        </p>
        <Link
          href="/automation/scene"
          className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Create a scene
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            void save();
          }}
          disabled={saving}
          className="text-sm font-semibold text-primary disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <p className="px-1 text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Schedule name"
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Scene to run</span>
        <select
          value={sceneId}
          onChange={(e) => {
            setSceneId(e.target.value);
          }}
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-primary"
        >
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Start at</span>
        <input
          type="time"
          value={startAt}
          onChange={(e) => {
            setStartAt(e.target.value);
          }}
          className="rounded-lg bg-muted px-3 py-1.5 text-lg font-semibold outline-none"
        />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Also revert at a time</span>
          <span className="text-xs text-muted-foreground">
            Undo the scene automatically after this window
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasEnd((v) => !v);
          }}
          className={cn(
            "h-7 min-w-14 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors",
            hasEnd ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {hasEnd ? "ON" : "OFF"}
        </button>
      </div>

      {hasEnd && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">End at</span>
          <input
            type="time"
            value={endAt}
            onChange={(e) => {
              setEndAt(e.target.value);
            }}
            className="rounded-lg bg-muted px-3 py-1.5 text-lg font-semibold outline-none"
          />
        </div>
      )}

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

      <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <span className="text-sm font-medium">Enabled</span>
        <button
          type="button"
          onClick={() => {
            setEnabled((v) => !v);
          }}
          className={cn(
            "h-7 min-w-14 rounded-full px-3 text-xs font-semibold transition-colors",
            enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleFormContent />
    </Suspense>
  );
}
