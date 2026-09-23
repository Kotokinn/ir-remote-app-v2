"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PhysicalProductType = "hub-ir" | "relay8";

/**
 * "auto" = pick automatically (RS485 if a port is assigned, else MQTT/BLE by health — see
 * device-commands.ts). Anything else pins to exactly that path: it is tried and only that one, no
 * silent fallback — the point of picking by hand is to know for sure which one just ran.
 */
export type TransportPreference = "auto" | "mqtt" | "ble" | "rs485";

export interface PhysicalDevice {
  id: string;
  name: string;
  roomId: string;
  productType: PhysicalProductType;
  online: boolean;
  /** Real device identity (eFuse MAC, docs/MQTT_API.md) once paired for real over BLE. */
  deviceId?: string;
  preferredTransport?: TransportPreference;
  /** RS485 only (relay8 hubs wired over a cable): the COM port this device is assigned to. */
  serialPort?: string;
}

interface HubsState {
  physicalDevices: PhysicalDevice[];
  hydrated: boolean;
  addPhysicalDevice: (device: Omit<PhysicalDevice, "id" | "online">) => PhysicalDevice;
  removePhysicalDevice: (id: string) => void;
  updatePhysicalDevice: (id: string, patch: Partial<PhysicalDevice>) => void;
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
      updatePhysicalDevice: (id, patch) =>
        set((state) => ({
          physicalDevices: state.physicalDevices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
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

/** Reverse lookup: which hub a real deviceId (eFuse MAC) belongs to. */
export function getPhysicalDeviceByDeviceId(
  physicalDevices: PhysicalDevice[],
  deviceId: string | undefined
): PhysicalDevice | undefined {
  if (!deviceId) return undefined;
  return physicalDevices.find((d) => d.deviceId === deviceId);
}
