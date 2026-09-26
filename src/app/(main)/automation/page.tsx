"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/home/confirm-dialog";
import { weekdayNames } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

function formatDays(days: number[], weekdays: string[], everyDay: string) {
  if (days.length === 7) return everyDay;
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => weekdays[d])
    .join(" ");
}

export default function AutomationPage() {
  const { t, i18n } = useTranslation();
  const weekdays = weekdayNames(i18n.language, "narrow");
  const [tab, setTab] = useState<"scenes" | "schedules">("schedules");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [activation, setActivation] = useState<{
    id: string;
    failedHubs: string[];
    crashed: boolean;
  } | null>(null);
  const activationOk = activation !== null && !activation.crashed && activation.failedHubs.length === 0;
  const activationProblem = activation?.crashed
    ? t("automation.runFailed")
    : activation && activation.failedHubs.length > 0
      ? t("automation.unreachable", { hubs: activation.failedHubs.join(", ") })
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
        <h1 className="text-2xl font-bold">{t("nav.automation")}</h1>
        <Link
          href={tab === "scenes" ? "/automation/scene" : "/automation/schedule"}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label={t("automation.createAria")}
        >
          <Plus className="size-4" />
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "scenes" | "schedules"); }}>
        <TabsList variant="line">
          <TabsTrigger value="scenes">{t("automation.tabScenes")}</TabsTrigger>
          <TabsTrigger value="schedules">{t("automation.tabSchedules")}</TabsTrigger>
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
                <p className="text-sm font-medium">{t("automation.noScenes")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("automation.noScenesHint")}
                </p>
                <Link
                  href="/automation/scene"
                  className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t("automation.createScene")}
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
                        {t("home.deviceCount", { count: scene.actions.length })}
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
                      ? t("automation.running")
                      : activation?.id === scene.id && activationOk
                        ? t("automation.activated")
                        : t("automation.activate")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteScene({ id: scene.id, name: scene.name });
                    }}
                    aria-label={t("room.removeAria", { name: scene.name })}
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
                <p className="text-sm font-medium">{t("automation.noSchedules")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("automation.noSchedulesHint")}
                </p>
                <Link
                  href="/automation/schedule"
                  className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t("automation.createSchedule")}
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
                            {formatDays(schedule.days, weekdays, t("automation.everyDay"))}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="size-3 shrink-0" />
                            {t("automation.sceneRemoved")}
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
                      aria-label={t("room.removeAria", { name: schedule.name })}
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
        title={t("room.removeTitle", { name: deleteScene?.name ?? t("automation.thisScene") })}
        description={t("automation.removeSceneHint")}
        onConfirm={() => {
          if (deleteScene) void removeScene(deleteScene.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteSchedule)}
        onOpenChange={(open) => {
          if (!open) setDeleteSchedule(null);
        }}
        title={t("room.removeTitle", { name: deleteSchedule?.name ?? t("automation.thisSchedule") })}
        onConfirm={() => {
          if (deleteSchedule) void removeSchedule(deleteSchedule.id);
        }}
      />
    </div>
  );
}
