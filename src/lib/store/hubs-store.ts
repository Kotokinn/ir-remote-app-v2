"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { hubsApi, toWirePatch, type AccessLevel, type HubResponse } from "@/lib/api/smart";
import { pendingByKey, recentlySyncedKind } from "@/lib/sync/outbox-store";
import { enqueueSync } from "@/lib/sync/queue";
import { applyWirePatch, reconcile } from "@/lib/sync/reconcile";

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
  // Household sharing — set by the server, absent on one that was just built locally.
  ownerAccountId?: number;
  access?: AccessLevel;
  /** May rename/remove it: the owner always, a room member only for what they added. Undefined = yes. */
  canEdit?: boolean;
}

/**
 * How THIS machine reaches a hub (which path to pin, which COM port the cable is on) — meaningless on
 * anyone else's machine, and with household sharing "anyone else" includes the owner. So these stay in
 * this device's local cache and are never sent to (or read back from) the server.
 */
const LOCAL_ONLY_KEYS = ["preferredTransport", "serialPort"] as const;

function fromResponse(response: HubResponse): PhysicalDevice {
  return {
    id: String(response.id),
    name: response.name,
    roomId: response.roomId ?? "",
    productType: response.productType as PhysicalProductType,
    online: response.online,
    deviceId: response.deviceId ?? undefined,
    ownerAccountId: response.ownerAccountId,
    access: response.access,
    canEdit: response.canEdit,
  };
}

interface HubsState {
  physicalDevices: PhysicalDevice[];
  /** Local cache loaded from storage — shown instantly while fetchHubs reconciles with the server. */
  hydrated: boolean;
  /** The server is the source of truth; on failure the cached list stays as it was. */
  fetchHubs: () => Promise<void>;
  /** Needs the server-assigned id, so — unlike update/remove — it can't be optimistic; rejects on failure. */
  addPhysicalDevice: (device: Omit<PhysicalDevice, "id" | "online">) => Promise<PhysicalDevice>;
  /** Applies at once; the server copy follows from the sync queue (retried until it gets there). */
  removePhysicalDevice: (id: string) => Promise<void>;
  /** Applies at once; the server copy follows from the sync queue (retried until it gets there). */
  updatePhysicalDevice: (id: string, patch: Partial<PhysicalDevice>) => Promise<void>;
}

export const useHubsStore = create<HubsState>()(
  persist(
    (set, get) => ({
      physicalDevices: [],
      hydrated: false,
      fetchHubs: async () => {
        try {
          const hubs = await hubsApi.list();
          set((state) => {
            const cached = new Map(state.physicalDevices.map((d) => [d.id, d]));
            const server = hubs.map((hub) => {
              const fresh = fromResponse(hub);
              const previous = cached.get(fresh.id);
              return {
                ...fresh,
                preferredTransport: previous?.preferredTransport,
                serialPort: previous?.serialPort,
              };
            });
            // Not a plain replace: changes still waiting in the sync queue must survive the fetch.
            return {
              physicalDevices: reconcile(
                server,
                state.physicalDevices,
                pendingByKey("hub"),
                (key) => recentlySyncedKind("hub", key),
                applyWirePatch
              ),
            };
          });
        } catch (error) {
          console.error("[hubs] refresh failed, keeping the cached list", error);
        }
      },
      addPhysicalDevice: async (device) => {
        const created = fromResponse(
          await hubsApi.create({
            name: device.name,
            roomId: device.roomId,
            productType: device.productType,
            deviceId: device.deviceId,
          })
        );
        set((state) => ({ physicalDevices: [...state.physicalDevices, created] }));
        return created;
      },
      removePhysicalDevice: (id) => {
        const hub = get().physicalDevices.find((d) => d.id === id);
        set((state) => ({ physicalDevices: state.physicalDevices.filter((d) => d.id !== id) }));
        // The server deletes the hub's devices together with it.
        enqueueSync({ entity: "hub", kind: "delete", key: id, label: hub?.name ?? "device" });
        return Promise.resolve();
      },
      updatePhysicalDevice: (id, patch) => {
        set((state) => ({
          physicalDevices: state.physicalDevices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }));
        const remote = Object.fromEntries(
          Object.entries(patch).filter(([key]) => !(LOCAL_ONLY_KEYS as readonly string[]).includes(key))
        );
        if (Object.keys(remote).length > 0) {
          const hub = get().physicalDevices.find((d) => d.id === id);
          enqueueSync({
            entity: "hub",
            kind: "patch",
            key: id,
            label: hub?.name ?? "device",
            payload: toWirePatch(remote),
          });
        }
        return Promise.resolve();
      },
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
