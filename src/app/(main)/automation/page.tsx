"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal, CalendarClock } from "lucide-react";
import { SCENES, SCHEDULES } from "@/lib/mock-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function AutomationPage() {
  const [tab, setTab] = useState<"scenes" | "schedules">("schedules");
  const [activatedId, setActivatedId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automation</h1>
        <Link
          href={`/automation/new?type=${tab === "scenes" ? "scene" : "schedule"}`}
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
            {SCENES.map((scene) => (
              <div
                key={scene.id}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground">
                  <SlidersHorizontal className="size-4" />
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{scene.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {scene.deviceCount} devices
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { setActivatedId(scene.id); }}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
                    activatedId === scene.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground/70"
                  )}
                >
                  {activatedId === scene.id ? "Activated" : "Activate"}
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="schedules">
          <div className="flex flex-col gap-2 pt-3">
            {SCHEDULES.map((schedule) => (
              <Link
                key={schedule.id}
                href={`/automation/new?type=schedule&id=${schedule.id}`}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground">
                  <SlidersHorizontal className="size-4" />
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{schedule.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {schedule.deviceCount} devices
                  </span>
                </div>
                <CalendarClock className="size-5 text-primary" />
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
