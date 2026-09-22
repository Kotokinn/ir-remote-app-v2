"use client";

import { create } from "zustand";
import type { Schedule } from "@/lib/mock-data";
import { schedulesApi, type ScheduleResponse } from "@/lib/api/smart";
import {
  hubDeviceIdsForScene,
  removeScheduleFromHubs,
  syncFailureMessage,
  syncScheduleToHubs,
} from "@/lib/device/schedule-sync";
import { useScenesStore } from "@/lib/store/scenes-store";

function sceneOf(schedule: Schedule) {
  return useScenesStore.getState().scenes.find((scene) => scene.id === schedule.sceneId);
}

function fromResponse(response: ScheduleResponse): Schedule {
  return {
    id: String(response.id),
    name: response.name,
    sceneId: String(response.sceneId),
    startAt: response.startAt,
    days: response.days,
    hasEnd: response.hasEnd,
    endAt: response.endAt ?? undefined,
    enabled: response.enabled,
  };
}

interface SchedulesState {
  schedules: Schedule[];
  hydrated: boolean;
  fetchSchedules: () => Promise<void>;
  addSchedule: (schedule: Omit<Schedule, "id">) => Promise<Schedule>;
  updateSchedule: (id: string, patch: Omit<Schedule, "id">) => Promise<void>;
  removeSchedule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}

export const useSchedulesStore = create<SchedulesState>()((set, get) => ({
  schedules: [],
  hydrated: false,
  fetchSchedules: async () => {
    try {
      const schedules = await schedulesApi.list();
      set({ schedules: schedules.map(fromResponse), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  addSchedule: async (schedule) => {
    const created = await schedulesApi.create({
      name: schedule.name,
      sceneId: Number(schedule.sceneId),
      startAt: schedule.startAt,
      days: schedule.days,
      hasEnd: schedule.hasEnd,
      endAt: schedule.endAt,
      enabled: schedule.enabled,
    });
    const mapped = fromResponse(created);
    set((state) => ({ schedules: [...state.schedules, mapped] }));
    const failedHubs = await syncScheduleToHubs(mapped, sceneOf(mapped));
    if (failedHubs.length > 0) throw new Error(syncFailureMessage(failedHubs));
    return mapped;
  },
  updateSchedule: async (id, patch) => {
    const previous = get().schedules.find((s) => s.id === id);
    const updated = await schedulesApi.update(Number(id), {
      name: patch.name,
      sceneId: Number(patch.sceneId),
      startAt: patch.startAt,
      days: patch.days,
      hasEnd: patch.hasEnd,
      endAt: patch.endAt,
      enabled: patch.enabled,
    });
    const mapped = fromResponse(updated);
    set((state) => ({
      schedules: state.schedules.map((s) => (s.id === id ? mapped : s)),
    }));
    // The old version may have pointed at other hubs (scene changed): those get the schedule deleted.
    const previousHubs = previous ? hubDeviceIdsForScene(sceneOf(previous)) : [];
    const failedHubs = await syncScheduleToHubs(mapped, sceneOf(mapped), previousHubs);
    if (failedHubs.length > 0) throw new Error(syncFailureMessage(failedHubs));
  },
  removeSchedule: async (id) => {
    const current = get().schedules.find((s) => s.id === id);
    await schedulesApi.remove(Number(id));
    set((state) => ({ schedules: state.schedules.filter((s) => s.id !== id) }));
    if (current) {
      const failedHubs = await removeScheduleFromHubs(current, sceneOf(current));
      if (failedHubs.length > 0) console.error("[schedules] couldn't delete from hubs:", failedHubs);
    }
  },
  toggleEnabled: async (id) => {
    const current = get().schedules.find((s) => s.id === id);
    if (!current) return;
    const updated = await schedulesApi.setEnabled(Number(id), !current.enabled);
    const mapped = fromResponse(updated);
    set((state) => ({
      schedules: state.schedules.map((s) => (s.id === id ? mapped : s)),
    }));
    const failedHubs = await syncScheduleToHubs(mapped, sceneOf(mapped));
    if (failedHubs.length > 0) console.error("[schedules] couldn't sync to hubs:", failedHubs);
  },
}));
