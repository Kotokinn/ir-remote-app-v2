"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PhysicalProductType = "hub-ir" | "relay8";

export interface PhysicalDevice {
  id: string;
  name: string;
  roomId: string;
  productType: PhysicalProductType;
  online: boolean;
  /** Real device identity (eFuse MAC, docs/MQTT_API.md) once paired for real over BLE. */
  deviceId?: string;
}

interface HubsState {
  physicalDevices: PhysicalDevice[];
  hydrated: boolean;
  addPhysicalDevice: (device: Omit<PhysicalDevice, "id" | "online">) => PhysicalDevice;
  removePhysicalDevice: (id: string) => void;
}

function newId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useHubsStore = create<HubsState>()(
  persist(
    (set) => ({
      physicalDevices: [],
      hydrated: false,
      addPhysicalDevice: (device) => {
        const created: PhysicalDevice = { ...device, id: newId(), online: true };
        set((state) => ({ physicalDevices: [...state.physicalDevices, created] }));
        return created;
      },
      removePhysicalDevice: (id) =>
        set((state) => ({
          physicalDevices: state.physicalDevices.filter((d) => d.id !== id),
        })),
    }),
    {
      name: "smart-home-hubs",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ physicalDevices: state.physicalDevices }),
    }
  )
);

export function getPhysicalDevice(
  physicalDevices: PhysicalDevice[],
  id: string | undefined
): PhysicalDevice | undefined {
  if (!id) return undefined;
  return physicalDevices.find((d) => d.id === id);
}
