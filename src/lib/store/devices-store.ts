"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Device } from "@/lib/mock-data";

interface DevicesState {
  devices: Device[];
  hydrated: boolean;
  addDevice: (device: Device) => void;
  addDevices: (devices: Device[]) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  removeDevicesByHub: (hubId: string) => void;
}

export const useDevicesStore = create<DevicesState>()(
  persist(
    (set) => ({
      devices: [],
      hydrated: false,
      addDevice: (device) =>
        set((state) => ({ devices: [...state.devices, device] })),
      addDevices: (devices) =>
        set((state) => ({ devices: [...state.devices, ...devices] })),
      updateDevice: (id, patch) =>
        set((state) => ({
          devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      removeDevice: (id) =>
        set((state) => ({ devices: state.devices.filter((d) => d.id !== id) })),
      removeDevicesByHub: (hubId) =>
        set((state) => ({ devices: state.devices.filter((d) => d.hubId !== hubId) })),
    }),
    {
      name: "smart-home-devices",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ devices: state.devices }),
    }
  )
);
