"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/home/confirm-dialog";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function formatDays(days: number[]) {
  if (days.length === 7) return "Every day";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d])
    .join(" ");
}

export default function AutomationPage() {
  const [tab, setTab] = useState<"scenes" | "schedules">("schedules");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [activation, setActivation] = useState<{
    id: string;
    failedHubs: string[];
    crashed: boolean;
  } | null>(null);
  const activationOk = activation !== null && !activation.crashed && activation.failedHubs.length === 0;
  const activationProblem = activation?.crashed
    ? "Couldn't run the scene."
    : activation && activation.failedHubs.length > 0
      ? `Couldn't reach: ${activation.failedHubs.join(", ")}. Check the hub is online or nearby, then try again.`
      : null;
  const scenes = useScenesStore((s) => s.scenes);
  const activateScene = useScenesStore((s) => s.activateScene);
  const removeScene = useScenesStore((s) => s.removeScene);
  const schedules = useSchedulesStore((s) => s.schedules);
  const removeSchedule = useSchedulesStore((s) => s.removeSchedule);
  const [deleteScene, setDeleteScene] = useState<{ id: string; name: string } | null>(null);
  const [deleteSchedule, setDeleteSchedule] = useState<{ id: string; name: string } | null>(
    null
  );

  function sceneName(sceneId: string) {
    return scenes.find((s) => s.id === sceneId)?.name;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automation</h1>
        <Link
          href={tab === "scenes" ? "/automation/scene" : "/automation/schedule"}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label="Create automation"
        >
          <Plus className="size-4" />
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "scenes" | "schedules"); }}>
        <TabsList variant="line">
          <TabsTrigger value="scenes">Scenes</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="scenes">
          <div className="flex flex-col gap-2 pt-3">
            {activationProblem && (
              <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {activationProblem}
              </p>
            )}
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-10 text-center">
                <p className="text-sm font-medium">No scenes yet</p>
                <p className="text-xs text-muted-foreground">
                  A scene saves a set of device states you can trigger with one tap.
                </p>
                <Link
                  href="/automation/scene"
                  className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Create a scene
                </Link>
              </div>
            ) : (
              scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border"
                >
                  <Link
                    href={`/automation/scene?id=${scene.id}`}
                    className="flex flex-1 items-center gap-3"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground">
                      <SlidersHorizontal className="size-4" />
                    </span>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold">{scene.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {scene.actions.length} device{scene.actions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    disabled={runningId !== null}
                    onClick={() => {
                      setRunningId(scene.id);
                      setActivation(null);
                      activateScene(scene.id)
                        .then((failedHubs) => {
                          setActivation({ id: scene.id, failedHubs, crashed: false });
                        })
                        .catch((error: unknown) => {
                          console.error("[scene] activate failed", error);
                          setActivation({ id: scene.id, failedHubs: [], crashed: true });
                        })
                        .finally(() => {
                          setRunningId(null);
                        });
                    }}
                    className={cn(
                      "h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-60",
                      activation?.id === scene.id && activationOk
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground/70"
                    )}
                  >
                    {runningId === scene.id
                      ? "Running…"
                      : activation?.id === scene.id && activationOk
                        ? "Activated"
                        : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteScene({ id: scene.id, name: scene.name });
                    }}
                    aria-label={`Remove ${scene.name}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="schedules">
          <div className="flex flex-col gap-2 pt-3">
            {schedules.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-10 text-center">
                <p className="text-sm font-medium">No schedules yet</p>
                <p className="text-xs text-muted-foreground">
                  Run a scene automatically at a set time and repeat days.
                </p>
                <Link
                  href="/automation/schedule"
                  className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Create a schedule
                </Link>
              </div>
            ) : (
              schedules.map((schedule) => {
                const linkedName = sceneName(schedule.sceneId);
                return (
                  <div
                    key={schedule.id}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl bg-card px-2 py-2 shadow-sm ring-1 ring-border",
                      !schedule.enabled && "opacity-60"
                    )}
                  >
                    <Link
                      href={`/automation/schedule?id=${schedule.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground">
                        <SlidersHorizontal className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{schedule.name}</span>
                        {linkedName ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {linkedName} · {schedule.startAt}
                            {schedule.hasEnd && schedule.endAt ? `–${schedule.endAt}` : ""} ·{" "}
                            {formatDays(schedule.days)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="size-3 shrink-0" />
                            Scene was removed
                          </span>
                        )}
                      </div>
                      <CalendarClock className="size-5 shrink-0 text-primary" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteSchedule({ id: schedule.id, name: schedule.name });
                      }}
                      aria-label={`Remove ${schedule.name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(deleteScene)}
        onOpenChange={(open) => {
          if (!open) setDeleteScene(null);
        }}
        title={`Remove ${deleteScene?.name ?? "this scene"}?`}
        description="Schedules pointing to this scene will show a warning."
        onConfirm={() => {
          if (deleteScene) void removeScene(deleteScene.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteSchedule)}
        onOpenChange={(open) => {
          if (!open) setDeleteSchedule(null);
        }}
        title={`Remove ${deleteSchedule?.name ?? "this schedule"}?`}
        onConfirm={() => {
          if (deleteSchedule) void removeSchedule(deleteSchedule.id);
        }}
      />
    </div>
  );
}
