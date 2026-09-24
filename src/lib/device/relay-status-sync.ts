"use client";

import { useEffect, useRef, useState } from "react";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { useDeviceStateStore } from "@/lib/store/device-state-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import type { PhysicalDevice } from "@/lib/store/hubs-store";

// Long enough for a normal MQTT round trip, short enough that an unreachable hub doesn't leave the
// caller's "syncing" flag (and whatever backdrop it drives) stuck up for good.
const SYNC_TIMEOUT_MS = 5000;

/**
 * Only the retained `state` topic (online/offline) replays when a fresh SSE subscription opens —
 * relayStatus lives in attributes/telemetry, which are NOT retained (docs/MQTT_API.md: "state
 * retained... mọi dữ liệu vận hành khác nằm ở attributes/telemetry"). So a relay flipped by
 * ThingsBoard, RS485, or while the app was closed shows stale here until the hub's next periodic
 * telemetry. Opening the Switches screen asks each relay8 hub directly instead of waiting for that.
 *
 * Uses `getState` once per hub rather than `getRelayN` once per channel: getRelayN's reply is a
 * bare boolean with nothing in it — or on the SSE event wrapping it — saying which relay it was
 * for, so firing one per channel has no reliable way to tell several concurrent replies apart.
 * getState's reply is a real object carrying every channel's bit at once (`relayStatus`),
 * unambiguous and one round trip per hub instead of up to eight.
 *
 * Only reaches devices over the MQTT/SSE path: a hub currently reachable only over BLE or RS485
 * won't get its relayStatus refreshed this way (same fire-and-forget limitation those transports
 * already have for every other command).
 *
 * Returns whether any hub is still awaited — the switches shown for it are still possibly stale,
 * so the caller can block taps on them (e.g. a backdrop) until the real state is known.
 */
export function useSyncRelayStatusOnOpen(hubs: PhysicalDevice[]): boolean {
  const relay8DeviceIds = hubs
    .filter((hub) => hub.productType === "relay8" && hub.deviceId)
    .map((hub) => hub.deviceId!);
  const key = relay8DeviceIds.join(",");
  const pending = useRef<Set<string>>(new Set());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!key) return;
    const timeoutIds: number[] = [];

    for (const deviceId of key.split(",")) {
      pending.current.add(deviceId);
      sendDeviceCommand(deviceId, "getState").catch((error: unknown) => {
        if (pending.current.delete(deviceId)) setPendingCount(pending.current.size);
        console.warn("[relay-status-sync] getState failed", deviceId, error);
      });
      timeoutIds.push(
        window.setTimeout(() => {
          if (pending.current.delete(deviceId)) setPendingCount(pending.current.size);
        }, SYNC_TIMEOUT_MS)
      );
    }
    setPendingCount(pending.current.size);

    return () => {
      for (const id of timeoutIds) window.clearTimeout(id);
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    return useDeviceStateStore.subscribe((store) => {
      let changed = false;
      for (const deviceId of [...pending.current]) {
        // Partial: a device with no events yet is simply absent (Record<string, T> index types hide that).
        const liveByDevice: Partial<typeof store.devices> = store.devices;
        const relayStatus = liveByDevice[deviceId]?.lastCommandResponse?.relayStatus;
        if (typeof relayStatus !== "number") continue;
        pending.current.delete(deviceId);
        changed = true;

        const hub = hubs.find((h) => h.deviceId === deviceId);
        if (!hub) continue;
        const { devices, updateDevice } = useDevicesStore.getState();
        for (const device of devices) {
          if (device.hubId !== hub.id || !device.relayIndex) continue;
          const isOn = (relayStatus & (1 << (device.relayIndex - 1))) !== 0;
          if (device.isOn !== isOn) void updateDevice(device.id, { isOn });
        }
      }
      if (changed) setPendingCount(pending.current.size);
    });
  }, [key]);

  return pendingCount > 0;
}
