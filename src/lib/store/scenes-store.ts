"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Scene, SceneAction } from "@/lib/mock-data";
import { scenesApi, type SceneBody, type SceneResponse } from "@/lib/api/smart";
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
import { newClientId } from "@/lib/sync/ids";
import { pendingByKey, recentlySyncedKind } from "@/lib/sync/outbox-store";
import { enqueueSync } from "@/lib/sync/queue";
import { reconcile } from "@/lib/sync/reconcile";

function fromResponse(response: SceneResponse): Scene {
  return {
    id: response.id,
    name: response.name,
    // Server round-trips patches as loosely-typed JSON; the app trusts its own
    // shape here the same way it already trusts localStorage-restored data.
    actions: response.actions as unknown as SceneAction[],
  };
}

function bodyOf(scene: Scene): SceneBody {
  return { name: scene.name, actions: scene.actions as unknown as SceneBody["actions"] };
}

function queueUpsert(scene: Scene) {
  enqueueSync({ entity: "scene", kind: "upsert", key: scene.id, label: scene.name, payload: { ...bodyOf(scene) } });
}

interface ScenesState {
  scenes: Scene[];
  hydrated: boolean;
  fetchScenes: () => Promise<void>;
  /** Local first: usable at once; the server copy follows from the sync queue. */
  addScene: (name: string, actions: SceneAction[]) => Promise<Scene>;
  updateScene: (id: string, name: string, actions: SceneAction[]) => Promise<void>;
  removeScene: (id: string) => Promise<void>;
  /** Runs the scene on the hardware; resolves to the names of hubs that could not be reached. */
  activateScene: (id: string) => Promise<string[]>;
}

export const useScenesStore = create<ScenesState>()(
  persist(
    (set, get) => ({
      scenes: [],
      hydrated: false,
      fetchScenes: async () => {
        try {
          const server = (await scenesApi.list()).map(fromResponse);
          set((state) => ({
            scenes: reconcile(server, state.scenes, pendingByKey("scene"), (key) => recentlySyncedKind("scene", key)),
            hydrated: true,
          }));
        } catch {
          // Offline / server down: keep what is cached — that is the point of caching it.
          set({ hydrated: true });
        }
      },
      addScene: (name, actions) => {
        const scene: Scene = { id: newClientId(), name, actions };
        set((state) => ({ scenes: [...state.scenes, scene] }));
        queueUpsert(scene);
        return Promise.resolve(scene);
      },
      updateScene: (id, name, actions) => {
        const previous = get().scenes.find((s) => s.id === id);
        const previousHubs = hubDeviceIdsForScene(previous);
        const scene: Scene = { id, name, actions };
        set((state) => ({ scenes: state.scenes.map((s) => (s.id === id ? scene : s)) }));
        queueUpsert(scene);
        // Schedules that run this scene now do something different (or on other hubs): re-push them.
        for (const schedule of useSchedulesStore.getState().schedules.filter((s) => s.sceneId === id)) {
          void syncScheduleToHubs(schedule, scene, previousHubs).then((failedHubs) => {
            if (failedHubs.length > 0) console.error("[scenes] couldn't re-sync schedule to hubs:", failedHubs);
          });
        }
        return Promise.resolve();
      },
      removeScene: (id) => {
        const scene = get().scenes.find((s) => s.id === id);
        const affected = useSchedulesStore.getState().schedules.filter((s) => s.sceneId === id);
        set((state) => ({ scenes: state.scenes.filter((s) => s.id !== id) }));
        enqueueSync({ entity: "scene", kind: "delete", key: id, label: scene?.name ?? "scene" });
        // The schedules of a deleted scene must stop running on the hubs too.
        for (const schedule of affected) {
          void removeScheduleFromHubs(schedule, scene).then((failedHubs) => {
            if (failedHubs.length > 0) console.error("[scenes] couldn't delete schedule from hubs:", failedHubs);
          });
        }
        return Promise.resolve();
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
          void updateDevice(action.deviceId, action.patch);
        }
        return Array.from(failedHubIds, hubLabel);
      },
    }),
    {
      name: "smart-home-scenes",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ scenes: state.scenes }),
    }
  )
);
