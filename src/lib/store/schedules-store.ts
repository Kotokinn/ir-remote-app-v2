"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Schedule } from "@/lib/mock-data";
import { schedulesApi, type ScheduleBody, type ScheduleResponse } from "@/lib/api/smart";
import {
  hubDeviceIdsForScene,
  removeScheduleFromHubs,
  syncFailureMessage,
  syncScheduleToHubs,
} from "@/lib/device/schedule-sync";
import { useScenesStore } from "@/lib/store/scenes-store";
import { newClientId } from "@/lib/sync/ids";
import { pendingByKey, recentlySyncedKind } from "@/lib/sync/outbox-store";
import { enqueueSync } from "@/lib/sync/queue";
import { reconcile } from "@/lib/sync/reconcile";

function sceneOf(schedule: Schedule) {
  return useScenesStore.getState().scenes.find((scene) => scene.id === schedule.sceneId);
}

function fromResponse(response: ScheduleResponse): Schedule {
  return {
    id: response.id,
    name: response.name,
    sceneId: response.sceneId,
    startAt: response.startAt,
    days: response.days,
    hasEnd: response.hasEnd,
    endAt: response.endAt ?? undefined,
    enabled: response.enabled,
  };
}

function bodyOf(schedule: Schedule): ScheduleBody {
  return {
    name: schedule.name,
    sceneId: schedule.sceneId,
    startAt: schedule.startAt,
    days: schedule.days,
    hasEnd: schedule.hasEnd,
    endAt: schedule.hasEnd ? schedule.endAt : undefined,
    enabled: schedule.enabled,
  };
}

/** Records the schedule for the server. It needs its scene there first, hence the dependency. */
function queueUpsert(schedule: Schedule) {
  enqueueSync({
    entity: "schedule",
    kind: "upsert",
    key: schedule.id,
    label: schedule.name,
    payload: { ...bodyOf(schedule) },
    dependsOn: { entity: "scene", key: schedule.sceneId },
  });
}

interface SchedulesState {
  schedules: Schedule[];
  hydrated: boolean;
  fetchSchedules: () => Promise<void>;
  /**
   * Local first: the schedule exists (and runs on the hubs) as soon as this returns; the server copy
   * follows from the sync queue whenever it can. Rejects only if the *hubs* couldn't be reached.
   */
  addSchedule: (schedule: Omit<Schedule, "id">) => Promise<Schedule>;
  updateSchedule: (id: string, patch: Omit<Schedule, "id">) => Promise<void>;
  removeSchedule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}

export const useSchedulesStore = create<SchedulesState>()(
  persist(
    (set, get) => ({
      schedules: [],
      hydrated: false,
      fetchSchedules: async () => {
        try {
          const server = (await schedulesApi.list()).map(fromResponse);
          set((state) => ({
            schedules: reconcile(server, state.schedules, pendingByKey("schedule"), (key) =>
              recentlySyncedKind("schedule", key)
            ),
            hydrated: true,
          }));
        } catch {
          // Offline / server down: keep what is cached — that is the point of caching it.
          set({ hydrated: true });
        }
      },
      addSchedule: async (schedule) => {
        const created: Schedule = { ...schedule, id: newClientId() };
        set((state) => ({ schedules: [...state.schedules, created] }));
        queueUpsert(created);
        const failedHubs = await syncScheduleToHubs(created, sceneOf(created));
        if (failedHubs.length > 0) throw new Error(syncFailureMessage(failedHubs));
        return created;
      },
      updateSchedule: async (id, patch) => {
        const previous = get().schedules.find((s) => s.id === id);
        const updated: Schedule = { ...patch, id };
        set((state) => ({ schedules: state.schedules.map((s) => (s.id === id ? updated : s)) }));
        queueUpsert(updated);
        // The old version may have pointed at other hubs (scene changed): those get the schedule deleted.
        const previousHubs = previous ? hubDeviceIdsForScene(sceneOf(previous)) : [];
        const failedHubs = await syncScheduleToHubs(updated, sceneOf(updated), previousHubs);
        if (failedHubs.length > 0) throw new Error(syncFailureMessage(failedHubs));
      },
      removeSchedule: async (id) => {
        const current = get().schedules.find((s) => s.id === id);
        set((state) => ({ schedules: state.schedules.filter((s) => s.id !== id) }));
        enqueueSync({ entity: "schedule", kind: "delete", key: id, label: current?.name ?? "schedule" });
        if (current) {
          const failedHubs = await removeScheduleFromHubs(current, sceneOf(current));
          if (failedHubs.length > 0) console.error("[schedules] couldn't delete from hubs:", failedHubs);
        }
      },
      toggleEnabled: async (id) => {
        const current = get().schedules.find((s) => s.id === id);
        if (!current) return;
        const updated: Schedule = { ...current, enabled: !current.enabled };
        set((state) => ({ schedules: state.schedules.map((s) => (s.id === id ? updated : s)) }));
        queueUpsert(updated);
        const failedHubs = await syncScheduleToHubs(updated, sceneOf(updated));
        if (failedHubs.length > 0) console.error("[schedules] couldn't sync to hubs:", failedHubs);
      },
    }),
    {
      name: "smart-home-schedules",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ schedules: state.schedules }),
    }
  )
);
