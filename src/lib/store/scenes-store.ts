"use client";

import { create } from "zustand";
import type { Scene, SceneAction } from "@/lib/mock-data";
import { scenesApi, type SceneResponse } from "@/lib/api/smart";
import {
  hubDeviceIdsForScene,
  hubLabel,
  removeScheduleFromHubs,
  runSceneOnHubs,
  syncScheduleToHubs,
} from "@/lib/device/schedule-sync";
import { useDevicesStore } from "@/lib/store/devices-store";
import { getPhysicalDevice, useHubsStore } from "@/lib/store/hubs-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";

function fromResponse(response: SceneResponse): Scene {
  return {
    id: String(response.id),
    name: response.name,
    // Server round-trips patches as loosely-typed JSON; the app trusts its own
    // shape here the same way it already trusts localStorage-restored data.
    actions: response.actions as unknown as SceneAction[],
  };
}

interface ScenesState {
  scenes: Scene[];
  hydrated: boolean;
  fetchScenes: () => Promise<void>;
  addScene: (name: string, actions: SceneAction[]) => Promise<Scene>;
  updateScene: (id: string, name: string, actions: SceneAction[]) => Promise<void>;
  removeScene: (id: string) => Promise<void>;
  /** Runs the scene on the hardware; resolves to the names of hubs that could not be reached. */
  activateScene: (id: string) => Promise<string[]>;
}

export const useScenesStore = create<ScenesState>()((set, get) => ({
  scenes: [],
  hydrated: false,
  fetchScenes: async () => {
    try {
      const scenes = await scenesApi.list();
      set({ scenes: scenes.map(fromResponse), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  addScene: async (name, actions) => {
    const created = await scenesApi.create({ name, actions });
    const scene = fromResponse(created);
    set((state) => ({ scenes: [...state.scenes, scene] }));
    return scene;
  },
  updateScene: async (id, name, actions) => {
    const previousHubs = hubDeviceIdsForScene(get().scenes.find((s) => s.id === id));
    const updated = await scenesApi.update(Number(id), { name, actions });
    const scene = fromResponse(updated);
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? scene : s)),
    }));
    // Schedules that run this scene now do something different (or on other hubs): re-push them.
    for (const schedule of useSchedulesStore.getState().schedules.filter((s) => s.sceneId === id)) {
      void syncScheduleToHubs(schedule, scene, previousHubs).then((failedHubs) => {
        if (failedHubs.length > 0) console.error("[scenes] couldn't re-sync schedule to hubs:", failedHubs);
      });
    }
  },
  removeScene: async (id) => {
    const scene = get().scenes.find((s) => s.id === id);
    const affected = useSchedulesStore.getState().schedules.filter((s) => s.sceneId === id);
    await scenesApi.remove(Number(id));
    set((state) => ({ scenes: state.scenes.filter((s) => s.id !== id) }));
    // The schedules of a deleted scene must stop running on the hubs too.
    for (const schedule of affected) {
      void removeScheduleFromHubs(schedule, scene).then((failedHubs) => {
        if (failedHubs.length > 0) console.error("[scenes] couldn't delete schedule from hubs:", failedHubs);
      });
    }
  },
  activateScene: async (id) => {
    const scene = get().scenes.find((s) => s.id === id);
    if (!scene) return [];
    // Real hardware first (MQTT, BLE fallback). The backend's /activate only echoes the stored
    // actions back, so the local copy is used and activation also works with the backend down.
    const failedHubIds = await runSceneOnHubs(scene);
    const { devices, updateDevice } = useDevicesStore.getState();
    const { physicalDevices } = useHubsStore.getState();
    for (const action of scene.actions) {
      const device = devices.find((d) => d.id === action.deviceId);
      const hubDeviceId = getPhysicalDevice(physicalDevices, device?.hubId)?.deviceId;
      // Don't show a state the unreachable hardware never received.
      if (hubDeviceId && failedHubIds.has(hubDeviceId)) continue;
      updateDevice(action.deviceId, action.patch);
    }
    return Array.from(failedHubIds, hubLabel);
  },
}));
