"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ApiError } from "@/lib/api/auth";
import { devicesApi, toWirePatch, type DeviceResponse } from "@/lib/api/smart";
import type { Device } from "@/lib/mock-data";

function fromResponse(response: DeviceResponse): Device {
  // The server-owned bookkeeping fields aren't part of the app's Device.
  const { createdByAccountId, createdAt, updatedAt, ...rest } = response;
  void createdByAccountId;
  void createdAt;
  void updatedAt;
  return {
    ...rest,
    id: String(response.id),
    roomId: response.roomId ?? "",
    hubId: response.hubId ?? undefined,
  } as Device;
}

/** The id is assigned by the server, so it is never part of a create body. */
function toCreateBody(device: Device): Record<string, unknown> {
  const { id, ...body } = device;
  void id;
  return body;
}

interface DevicesState {
  devices: Device[];
  /** Local cache loaded from storage — shown instantly while fetchDevices reconciles with the server. */
  hydrated: boolean;
  /** The server is the source of truth; on failure the cached list stays as it was. */
  fetchDevices: () => Promise<void>;
  /** Needs the server-assigned id, so — unlike update/remove — it can't be optimistic; rejects on failure. */
  addDevice: (device: Device) => Promise<Device>;
  /** One at a time so ids come back in order; those created before a failure stay added, then it rejects. */
  addDevices: (devices: Device[]) => Promise<Device[]>;
  /** Local change applies at once; the server save runs behind it and never rejects (failure is logged). */
  updateDevice: (id: string, patch: Partial<Device>) => Promise<void>;
  /** Local change applies at once; the server save runs behind it and never rejects (failure is logged). */
  removeDevice: (id: string) => Promise<void>;
  /** Local only: the server deletes a hub's devices together with the hub (see removePhysicalDevice). */
  removeDevicesByHub: (hubId: string) => void;
}

export const useDevicesStore = create<DevicesState>()(
  persist(
    (set, get) => ({
      devices: [],
      hydrated: false,
      fetchDevices: async () => {
        try {
          const devices = await devicesApi.list();
          set({ devices: devices.map(fromResponse) });
        } catch (error) {
          console.error("[devices] refresh failed, keeping the cached list", error);
        }
      },
      addDevice: async (device) => {
        const created = fromResponse(await devicesApi.create(toCreateBody(device)));
        set((state) => ({ devices: [...state.devices, created] }));
        return created;
      },
      addDevices: async (devices) => {
        const created: Device[] = [];
        for (const device of devices) {
          created.push(await get().addDevice(device));
        }
        return created;
      },
      updateDevice: async (id, patch) => {
        set((state) => ({
          devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }));
        try {
          await devicesApi.patch(Number(id), toWirePatch(patch));
        } catch (error) {
          console.error("[devices] update failed", error);
        }
      },
      removeDevice: async (id) => {
        set((state) => ({ devices: state.devices.filter((d) => d.id !== id) }));
        try {
          await devicesApi.remove(Number(id));
        } catch (error) {
          // 404 = already gone (e.g. removed from another device): the outcome the user wanted.
          if (error instanceof ApiError && error.status === 404) return;
          console.error("[devices] delete failed", error);
        }
      },
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
